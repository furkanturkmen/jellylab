import type { MediaSource } from '@/api/jellyfin';

export type Engine = 'native' | 'vlc';
export type PlayMode = 'direct' | 'transcode';

export type PlaybackDecision = {
  engine: Engine;
  mode: PlayMode;
  /** bits per second — only set when mode is 'transcode' */
  maxBitrate?: number;
};

const NATIVE_CONTAINERS = new Set(['mp4', 'm4v', 'mov', 'mp3', 'm4a']);
const NATIVE_VIDEO_CODECS = new Set(['h264', 'hevc', 'h265', 'mpeg4']);
const NATIVE_AUDIO_CODECS = new Set(['aac', 'ac3', 'eac3', 'alac', 'mp3']);

export function decideEngine(sources: MediaSource[]): Engine {
  const src = sources[0];
  if (!src) return 'native';

  const container = (src.Container ?? '').toLowerCase().split(',')[0].trim();
  if (container && !NATIVE_CONTAINERS.has(container)) return 'vlc';

  const streams = src.MediaStreams ?? [];
  for (const s of streams) {
    const codec = (s.Codec ?? '').toLowerCase();
    if (s.Type === 'Video' && codec && !NATIVE_VIDEO_CODECS.has(codec)) return 'vlc';
    if (s.Type === 'Audio' && codec && !NATIVE_AUDIO_CODECS.has(codec)) return 'vlc';
  }
  return 'native';
}

/**
 * Direct play is always preferred: the server just reads the file off disk.
 * We only ask it to transcode when the source bitrate is above the user's
 * ceiling, which is the case a phone on cellular can't stream otherwise.
 *
 * A ceiling of 0 means unlimited, and an unknown source bitrate is treated
 * as "can't tell" — both fall through to direct play rather than making the
 * server do work on a guess.
 */
/**
 * What the server sends when AVPlayer is asked for a file it cannot open.
 *
 * High enough that 1080p does not visibly suffer, low enough that the server
 * is not encoding a near-lossless stream for a phone.
 */
export const FORCED_TRANSCODE_BITRATE = 20_000_000;

export function decidePlayback(
  sources: MediaSource[],
  maxBitrateMbps: number,
  /** What the user asked for in Settings. 'auto' lets the file decide. */
  preferred: 'auto' | Engine = 'auto',
): PlaybackDecision {
  const ceiling = Math.round((maxBitrateMbps || 0) * 1_000_000);
  const sourceBitrate = sources[0]?.Bitrate ?? 0;

  if (ceiling > 0 && sourceBitrate > ceiling) {
    // Jellyfin transcodes to h264/aac inside HLS, which is AVPlayer's native
    // format — so the transcode path gets the better battery and AirPlay story.
    return { engine: 'native', mode: 'transcode', maxBitrate: ceiling };
  }

  if (preferred === 'vlc') return { engine: 'vlc', mode: 'direct' };

  /**
   * "Always use AVPlayer" has to mean something for a file AVPlayer cannot
   * open. It used to hand it the mkv anyway: the player errored on the first
   * frame and the screen fell back to VLC without saying so, which read as the
   * setting being ignored. Asking the server to transcode gives AVPlayer the
   * HLS stream it can actually play, which is what the setting was for.
   */
  if (preferred === 'native' && decideEngine(sources) !== 'native') {
    return { engine: 'native', mode: 'transcode', maxBitrate: ceiling || FORCED_TRANSCODE_BITRATE };
  }

  return { engine: decideEngine(sources), mode: 'direct' };
}
