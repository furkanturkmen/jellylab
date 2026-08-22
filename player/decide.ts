import type { MediaSource } from '@/api/jellyfin';

export type Engine = 'native' | 'vlc';

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
