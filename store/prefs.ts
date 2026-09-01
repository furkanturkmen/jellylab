import * as SecureStore from 'expo-secure-store';

import { DEFAULT_CAP_GB } from '@/lib/downloadSpace';

import { parseStored } from './json';

const KEY = 'user_prefs';

export type PlayerEngine = 'auto' | 'native' | 'vlc';

export type Prefs = {
  subtitleLanguage: string; // e.g. 'eng', 'nld', 'off'
  subtitleSize: 'sm' | 'md' | 'lg';
  /**
   * The subtitle chosen by hand, keyed by series id - or by item id for a film.
   *
   * Per title, not one value for everything. It was global: picking a Dutch
   * track on one film made Dutch the default on every title that happened to
   * carry one, quietly beating the language preference everywhere. A choice
   * made about one film is a statement about that film.
   *
   * 'off' is stored like any other choice, so turning subtitles off stays off
   * for that title and nowhere else.
   */
  subtitleChoices: Record<string, string>;
  /**
   * Subtitle timing offsets in milliseconds, keyed by series id - or by item
   * id for a film. Positive shows subs later.
   *
   * Per series rather than one global number: a release group's subs are
   * usually out by the same amount for a whole season, so the correction found
   * on episode one is the right starting point for episode two. One shared
   * value would carry that same offset onto every unrelated title afterwards,
   * which is worse than not remembering it at all.
   */
  subtitleDelays: Record<string, number>;
  audioLanguage: string;
  /**
   * The audio track chosen by hand, keyed the same way as subtitleChoices.
   *
   * Per title for the same reason: this was one label for the whole library,
   * so picking an English dub on one series made it the choice on every title
   * carrying a track by that name, over the top of the language preference.
   *
   * Named audioTrackChoices rather than audioChoices because the player
   * already calls its list of available tracks audioChoices, and one of those
   * two reading as the other is a mistake waiting to happen.
   */
  audioTrackChoices: Record<string, string>;
  autoplayNext: boolean;
  preferredEngine: PlayerEngine;
  uiLanguage: string; // 'system' or one of SUPPORTED_LANGS
  maxBitrateMbps: number; // 0 = unlimited: always direct play the original file
  /** jellylab-push base URL, e.g. http://192.168.1.10:8099 - used for the storage readout */
  pushUrl: string;
  /**
   * Why a request was rejected, keyed by TMDB id.
   *
   * Jellyseerr records *that* a request was declined and nothing about why, so
   * a rejected row is a dead end with no explanation - which is the state Bin
   * Roye was in for a day before anyone worked out that all seven of its
   * releases had dead swarms.
   *
   * Kept on the device rather than pushed anywhere: it is a note to self about
   * a decision made on this phone, and the alternative is a write endpoint on
   * a service that is deliberately read-only.
   */
  rejectionReasons: Record<string, string>;
  /**
   * How many gigabytes downloads may hold on this phone.
   *
   * A preference rather than a constant because the right number belongs to
   * the device. The default is measured rather than guessed - see
   * `lib/downloadSpace.ts`. Nothing is ever deleted to honour it: crossing it
   * asks, and offers the watched files back.
   */
  downloadCapGb: number;
};

export const DEFAULT_PREFS: Prefs = {
  subtitleLanguage: 'eng',
  subtitleSize: 'md',
  subtitleChoices: {},
  subtitleDelays: {},
  audioLanguage: 'original',
  audioTrackChoices: {},
  autoplayNext: true,
  preferredEngine: 'auto',
  uiLanguage: 'system',
  maxBitrateMbps: 0,
  pushUrl: '',
  rejectionReasons: {},
  downloadCapGb: DEFAULT_CAP_GB,
};

export async function loadPrefs(): Promise<Prefs> {
  const raw = await SecureStore.getItemAsync(KEY);
  // Spread over the defaults, so a blob written by an older version is missing
  // keys rather than breaking on them.
  return { ...DEFAULT_PREFS, ...parseStored<Partial<Prefs>>(raw, {}, 'preferences') };
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(prefs));
}

/** How many series keep a remembered subtitle offset before the oldest is dropped. */
const MAX_SUBTITLE_DELAYS = 50;

/**
 * Record a subtitle offset for one series, bounded so the prefs blob cannot
 * grow without limit. Object keys keep insertion order, so the first one out
 * is the least recently set. A zero offset is stored as a deletion - the
 * default is already zero, and keeping it would evict something useful.
 */
/**
 * Remember the subtitle chosen by hand for one title, bounded the same way and
 * for the same reason as the offsets above.
 *
 * An empty label is stored as a deletion: "no choice made here" is the state
 * that lets the language preference decide again.
 */
/**
 * Remember why a title was rejected, bounded like the other per-title maps.
 *
 * Fifty is far more than anyone rejects, and an unbounded map that only ever
 * grows is a slow leak in a file read on every launch.
 */
export function withRejectionReason(
  prefs: Prefs,
  tmdbId: number | string,
  reason: string | null,
): Record<string, string> {
  const key = String(tmdbId);
  const next = { ...(prefs.rejectionReasons ?? {}) };
  delete next[key];
  if (reason) next[key] = reason;
  const keys = Object.keys(next);
  if (keys.length > 50) delete next[keys[0]];
  return next;
}

export function withSubtitleChoice(prefs: Prefs, key: string, label: string): Prefs {
  const next = { ...(prefs.subtitleChoices ?? {}) };
  delete next[key];
  if (label) next[key] = label;
  const keys = Object.keys(next);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_SUBTITLE_DELAYS))) {
    delete next[stale];
  }
  return { ...prefs, subtitleChoices: next };
}

/** The audio equivalent of withSubtitleChoice, bounded the same way. */
export function withAudioChoice(prefs: Prefs, key: string, label: string): Prefs {
  const next = { ...(prefs.audioTrackChoices ?? {}) };
  delete next[key];
  if (label) next[key] = label;
  const keys = Object.keys(next);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_SUBTITLE_DELAYS))) {
    delete next[stale];
  }
  return { ...prefs, audioTrackChoices: next };
}

export function withSubtitleDelay(prefs: Prefs, key: string, ms: number): Prefs {
  const next = { ...(prefs.subtitleDelays ?? {}) };
  delete next[key];
  if (ms !== 0) next[key] = ms;
  const keys = Object.keys(next);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_SUBTITLE_DELAYS))) {
    delete next[stale];
  }
  return { ...prefs, subtitleDelays: next };
}
