// src/lib/i18n/languages.ts
//
// BCP 47 language list utilities for the language selector.
// Provides comprehensive language code -> label mapping with support
// for custom language codes (translanguaging).

import languageData from './languages.json';

export interface LanguageOption {
  code: string;
  label: string;
}

// All available languages, combined
export const ALL_LANGUAGES: LanguageOption[] = [
  ...languageData.common,
  ...languageData.extended
];

/**
 * Find language label by code, or return the code if not found
 * (supports custom/oddball language codes)
 */
export function getLanguageLabel(code: string): string {
  const lang = ALL_LANGUAGES.find(l => l.code === code);
  return lang?.label || code;
}

/**
 * Filter languages by search term (case-insensitive)
 * Searches both code and label
 */
export function filterLanguages(term: string, options: LanguageOption[] = ALL_LANGUAGES): LanguageOption[] {
  if (!term) return options;

  const lower = term.toLowerCase();
  return options.filter(
    opt => opt.code.toLowerCase().includes(lower) || opt.label.toLowerCase().includes(lower)
  );
}
