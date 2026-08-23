import * as SecureStore from 'expo-secure-store';

const KEY = 'user_prefs';

export type PlayerEngine = 'auto' | 'native' | 'vlc';

export type Prefs = {
  subtitleLanguage: string; // e.g. 'eng', 'nld', 'off'
  subtitleSize: 'sm' | 'md' | 'lg';
  lastSubLabel: string; // exact label of the last-picked external sub, remembered across sessions
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
  /** exact label of the last-picked audio track, remembered across sessions */
  lastAudioLabel: string;
  autoplayNext: boolean;
  preferredEngine: PlayerEngine;
  uiLanguage: string; // 'system' or one of SUPPORTED_LANGS
  maxBitrateMbps: number; // 0 = unlimited: always direct play the original file
  pushUrl: string;        // jellylab-push base URL, e.g. http://192.168.1.10:8099
  pushSecret: string;     // PUSH_REGISTER_SECRET from the server's .env
  pushToken: string;      // last registered Expo token, kept so we can unregister
};

export const DEFAULT_PREFS: Prefs = {
  subtitleLanguage: 'eng',
  subtitleSize: 'md',
  lastSubLabel: '',
  subtitleDelays: {},
  audioLanguage: 'original',
  lastAudioLabel: '',
  autoplayNext: true,
  preferredEngine: 'auto',
  uiLanguage: 'system',
  maxBitrateMbps: 0,
  pushUrl: '',
  pushSecret: '',
  pushToken: '',
};

export async function loadPrefs(): Promise<Prefs> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
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
