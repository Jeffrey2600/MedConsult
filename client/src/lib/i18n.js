import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en/translation.json';
import ta from '../locales/ta/translation.json';
import hi from '../locales/hi/translation.json';
import te from '../locales/te/translation.json';
import ml from '../locales/ml/translation.json';

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
      hi: { translation: hi },
      te: { translation: te },
      ml: { translation: ml },
    },
    // Any key not yet translated falls through to English rather than
    // rendering the raw key, so a partially translated locale still reads well.
    fallbackLng: 'en',
    supportedLngs: LANGUAGE_CODES,
    // 'en-GB' and friends should resolve to 'en'.
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'medconsult.language',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  })
  .then(() => {
    // init() resolves after the initial detection has already run and fired
    // its own 'languageChanged' — before the .on() listener below existed to
    // catch it. Without this, a page loaded straight into a saved non-English
    // language (e.g. a full reload, not a same-session switch) keeps
    // <html lang="en">, which is wrong for screen readers even though every
    // string on the page is correctly translated.
    document.documentElement.setAttribute('lang', i18n.resolvedLanguage);
  });

/** Keeps <html lang> in sync for every language switch after the first. */
i18n.on('languageChanged', (lng) => {
  document.documentElement.setAttribute('lang', lng);
});

export default i18n;
