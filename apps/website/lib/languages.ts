/**
 * Backward-compatible re-export. The real language configuration now lives
 * in apps/website/lib/translations/ — see translations/index.ts for the
 * "how to add/remove a language" instructions. This file exists only so
 * older imports of '@/lib/languages' keep working; new code should import
 * directly from '@/lib/translations'.
 */
export { LANGUAGES, TRANSLATIONS, type LanguageCode, type TranslationKey } from './translations';
