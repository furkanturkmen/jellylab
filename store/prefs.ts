import * as SecureStore from 'expo-secure-store';

const KEY = 'user_prefs';

export type Prefs = {
  subtitleLanguage: string; // e.g. 'eng', 'nld', 'off'
  subtitleSize: 'sm' | 'md' | 'lg';
  audioLanguage: string;
  autoplayNext: boolean;
  preferVLC: boolean;
  includeAdult: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  subtitleLanguage: 'eng',
  subtitleSize: 'md',
  audioLanguage: 'original',
  autoplayNext: true,
  preferVLC: false,
  includeAdult: false,
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
