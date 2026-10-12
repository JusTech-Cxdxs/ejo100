'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { LANGUAGES, TRANSLATIONS, type LanguageCode, type TranslationKey } from './languages';
import { siteConfig } from './site-config';

export type { TranslationKey };

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = 'ejo-language';

/** Organisation details in translated text come from lib/site-config.ts, never from the strings. */
function fillPlaceholders(text: string): string {
  const founded = siteConfig.foundedYear;
  return text
    .replaceAll('{organisation}', siteConfig.organisationName)
    .replaceAll('{ORGANISATION}', siteConfig.organisationName.toUpperCase())
    .replaceAll('{founded}', founded ? String(founded) : '')
    .replaceAll('{years}', founded ? String(new Date().getFullYear() - founded) : '');
}

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
    return fillPlaceholders(TRANSLATIONS[language]?.[key] ?? TRANSLATIONS.en[key] ?? key);
  }

  return <I18nContext.Provider value={{ language, setLanguage, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
