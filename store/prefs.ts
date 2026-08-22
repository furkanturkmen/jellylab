import * as SecureStore from 'expo-secure-store';

const KEY = 'user_prefs';

export type PlayerEngine = 'auto' | 'native' | 'vlc';

export type Prefs = {
  subtitleLanguage: string; // e.g. 'eng', 'nld', 'off'
  subtitleSize: 'sm' | 'md' | 'lg';
  audioLanguage: string;
  autoplayNext: boolean;
  preferredEngine: PlayerEngine;
  includeAdult: boolean;
  uiLanguage: string; // 'system' or one of SUPPORTED_LANGS
};

export const DEFAULT_PREFS: Prefs = {
  subtitleLanguage: 'eng',
  subtitleSize: 'md',
  audioLanguage: 'original',
  autoplayNext: true,
  preferredEngine: 'auto',
  includeAdult: false,
  uiLanguage: 'system',
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
