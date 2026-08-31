import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import nl from './locales/nl.json';
import tr from './locales/tr.json';
import de from './locales/de.json';
import { loadPrefs } from '@/store/prefs';

export const SUPPORTED_LANGS = ['en', 'nl', 'tr', 'de'] as const;
export type SupportedLang = typeof SUPPORTED_LANGS[number];

export function detectDeviceLang(): SupportedLang {
  const locales = Localization.getLocales();
  for (const l of locales) {
    const code = (l.languageCode ?? '').toLowerCase();
    if ((SUPPORTED_LANGS as readonly string[]).includes(code)) {
      return code as SupportedLang;
    }
  }
  return 'en';
}

// i18n here is the singleton instance, so use() is its method - not the
// module's same-named export.
// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  lng: detectDeviceLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  resources: {
    en: { translation: en },
    nl: { translation: nl },
    tr: { translation: tr },
    de: { translation: de },
  },
});

// Apply the user-picked language after prefs load.
loadPrefs().then(p => {
  if (p.uiLanguage && p.uiLanguage !== 'system' && (SUPPORTED_LANGS as readonly string[]).includes(p.uiLanguage)) {
    // Method on the instance, not the module export.
    // eslint-disable-next-line import/no-named-as-default-member
    i18n.changeLanguage(p.uiLanguage);
  }
});

export async function setLanguage(lang: 'system' | SupportedLang) {
  if (lang === 'system') {
    // Method on the instance, not the module export.
    // eslint-disable-next-line import/no-named-as-default-member
    await i18n.changeLanguage(detectDeviceLang());
  } else {
    // Method on the instance, not the module export.
    // eslint-disable-next-line import/no-named-as-default-member
    await i18n.changeLanguage(lang);
  }
}

export default i18n;
