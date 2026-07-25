import en from './en';
import hi from './hi';
import yo from './yo';
import ig from './ig';
import ha from './ha';
import zh from './zh';
import fr from './fr';
import ar from './ar';

/**
 * ============================================================================
 * LANGUAGE CONFIGURATION — edit this file to add or remove languages.
 * ============================================================================
 *
 * To add a language:
 *   1. Create apps/website/lib/translations/<code>.ts, copying an existing
 *      file (e.g. fr.ts) as a template. TypeScript will error on that new
 *      file until every key from en.ts has a translation — that's
 *      intentional, it's how missing translations get caught at build time
 *      instead of silently falling back to English in production.
 *   2. Import it below and add it to both `LANGUAGES` and `TRANSLATIONS`.
 *
 * To remove a language: delete its entry from `LANGUAGES` and
 * `TRANSLATIONS`, then delete its file in this folder.
 *
 * To add a new translatable STRING (not a whole language): add the key to
 * `en.ts` first (it's the canonical key list every other file is
 * type-checked against), then add the same key to all 7 other files here.
 * ============================================================================
 */

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳', dir: 'ltr' },
  { code: 'yo', label: 'Yorùbá', flag: '🇳🇬', dir: 'ltr' },
  { code: 'ig', label: 'Igbo', flag: '🇳🇬', dir: 'ltr' },
  { code: 'ha', label: 'Hausa', flag: '🇳🇬', dir: 'ltr' },
  { code: 'zh', label: '中文', flag: '🇨🇳', dir: 'ltr' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];
export type TranslationKey = keyof typeof en;

export const TRANSLATIONS: Record<LanguageCode, Record<TranslationKey, string>> = {
  en,
  hi,
  yo,
  ig,
  ha,
  zh,
  fr,
  ar,
};
