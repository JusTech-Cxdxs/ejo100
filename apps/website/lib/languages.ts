/**
 * Re-export for older imports of '@/lib/languages'. Language configuration
 * lives in lib/translations/ (see translations/index.ts); new code should
 * import from '@/lib/translations'.
 */
export { LANGUAGES, TRANSLATIONS, type LanguageCode, type TranslationKey } from './translations';
