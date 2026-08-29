import type { Engine, PlayMode } from '@/player/decide';
import type { TrickplayInfo } from '@/lib/trickplay';

/**
 * What the item screen hands a player, and the few numbers both engines agree
 * on. Lifted out of the screen so the engines can live in their own files
 * without importing it back - which would be a cycle, since it renders them.
 */

export type PlaybackConfig = {
  url: string;
  engine: Engine;
  mode: PlayMode;
  mediaSourceId?: string;
  externalSubs: { index: number; label: string }[];
  audioStreams: AudioStream[];
  /** Which track the server is encoding, when it is encoding one. */
  audioStreamIndex?: number | null;
  /**
   * The language the player should select on its own, already resolved -
   * "original" turned into the language TMDB says the thing was made in.
   */
  preferredAudioLanguage?: string;
  /**
   * What TMDB says the title was made in, whatever the preference is.
   *
   * Used to name a track the file left untagged: a YTS mp4 arrives with one
   * audio stream marked "und", and "Turkish" beats "AAC - Stereo" as a label
   * when both servers already know the film is Turkish.
   */
  originalLanguage?: string;
  /**
   * Where to start, when this config replaced another mid-playback.
   *
   * Switching audio on a transcode is a new stream, and a new stream starts at
   * zero unless told otherwise - which would throw away the position every
   * time someone changed track.
   */
  startAt?: number;
  /**
   * Scrub previews for this source, when the server has generated them.
   *
   * Resolved here rather than in the player because it depends on which
   * media source is playing, which is a decision this screen already made.
   * The token rides along because the players only load auth lazily, inside
   * async work, and a scrub cannot wait for that.
   */
  trickplay?: { info: TrickplayInfo; token: string } | null;
};

/** An audio track as Jellyfin describes it, before VLC has opened the file. */
export type AudioStream = { index: number; label: string; language?: string };

/**
 * How long the controls stay up before fading, with the film running.
 *
 * Long enough to read the time remaining and decide, short enough that it does
 * not sit over the picture while you have gone back to watching. Paused, they
 * stay: a paused film is one you have stopped to do something with.
 */
export const CONTROLS_HIDE_MS = 3000;

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
