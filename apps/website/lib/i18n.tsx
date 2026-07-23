'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { LANGUAGES, TRANSLATIONS, type LanguageCode, type TranslationKey } from './languages';

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = 'ejo-language';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
    if (stored && TRANSLATIONS[stored]) {
      applyLanguage(stored);
      setLanguageState(stored);
    }
  }, []);

  function applyLanguage(code: LanguageCode) {
    const lang = LANGUAGES.find((l) => l.code === code);
    document.documentElement.lang = code;
    document.documentElement.dir = lang?.dir ?? 'ltr';
  }

  function setLanguage(code: LanguageCode) {
    setLanguageState(code);
    applyLanguage(code);
    window.localStorage.setItem(STORAGE_KEY, code);
  }

  function t(key: TranslationKey): string {
    return TRANSLATIONS[language]?.[key] ?? TRANSLATIONS.en[key] ?? key;
  }

  return <I18nContext.Provider value={{ language, setLanguage, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
