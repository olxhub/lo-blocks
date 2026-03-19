// src/lib/i18n/languages.ts
//
// BCP 47 language list utilities using CLDR data.
// Provides comprehensive language code -> label mapping with support
// for custom language codes (translanguaging).

// TODO: Show in native language. Eliminate all the places we use `en`

import cldrLocales from 'cldr-core/availableLocales.json';

export interface LanguageOption {
  code: string;
  label: string;
}

/**
 * Get all CLDR locale codes (comprehensive list of world languages/regions)
 */
function getAvailableLocales(): string[] {
  const data = cldrLocales as { availableLocales: { full: string[] } };
  return data.availableLocales.full || [];
}

/**
 * Get display name for a language code using Intl.DisplayNames
 * Uses the provided locale for localized display names.
 * Falls back to the code itself if display name cannot be generated
 */
function getDisplayName(code: string, displayLocale: string = 'en'): string {
  try {
    const displayNames = new Intl.DisplayNames(displayLocale, { type: 'language' });
    return displayNames.of(code) || code;
  } catch {
    // If Intl.DisplayNames fails, return the code as-is
    return code;
  }
}

/**
 * Build language options from CLDR locales
 * Uses full locale codes (en-Latn-US, zh-Hans-CN, etc.) with display names
 */
function buildLanguageOptions(displayLocale: string = 'en'): LanguageOption[] {
  const locales = getAvailableLocales();
  const options: LanguageOption[] = locales.map(locale => ({
    code: locale,
    label: `${locale} - ${getDisplayName(locale, displayLocale)}`
  }));

  // Sort by label for better UX in dropdown
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

// Cache language options per display locale
const cachedLanguageOptions = new Map<string, LanguageOption[]>();

/**
 * Get all available language options
 *
 * @param displayLocale - The locale to use for display names (default 'en')
 * @returns Array of language options with codes and localized names
 */
export function getLanguageOptions(displayLocale: string = 'en'): LanguageOption[] {
  if (!cachedLanguageOptions.has(displayLocale)) {
    cachedLanguageOptions.set(displayLocale, buildLanguageOptions(displayLocale));
  }
  return cachedLanguageOptions.get(displayLocale)!;
}

// Export for backward compatibility with LanguageSwitcher
// Built with English display names by default
export const ALL_LANGUAGES = getLanguageOptions('en');

/**
 * Find language label by code
 * Returns the code and display name (e.g., 'en-Latn-US - English (United States)')
 * Supports custom/oddball language codes via Intl.DisplayNames fallback
 *
 * @param code - Language code to look up
 * @param displayLocale - Optional locale for display names (default 'en')
 * @param format - 'full' (code - name) or 'short' (language (region)) or 'name' (just name)
 */
export function getLanguageLabel(code: string, displayLocale: string = 'en', format: 'full' | 'short' | 'name' = 'full'): string {
  // Check cache first
  const options = getLanguageOptions(displayLocale);
  const lang = options.find(l => l.code === code);

  let fullLabel = lang?.label || `${code} - ${getDisplayName(code, displayLocale)}`;

  // Handle format options
  if (format === 'full') {
    return fullLabel;
  }

  // Extract display name from "code - display name" format
  const parts = fullLabel.split(' - ');
  const displayName = parts[1] || fullLabel;

  if (format === 'name') {
    return displayName;
  }

  // format === 'short': extract language and region
  // e.g., "English (United States)" -> "English (US)"
  const codeParts = code.split('-');
  const region = codeParts[codeParts.length - 1]; // Last part is region
  const langMatch = displayName.match(/^([^(]+)/); // Text before parentheses
  const langName = langMatch ? langMatch[1].trim() : displayName;

  return `${langName} (${region})`;
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

/**
 * Normalize browser locale code to BCP 47 format
 *
 * Browser returns codes like: en-US, ar-SA, fr
 * We want to return: en, ar, fr (just primary language for now)
 *
 * This enables consistent handling between browser locale and our system.
 * In the future, we could expand to full BCP 47 with script tags (en-Latn-US)
 * by using Intl.Locale API.
 */
export function normalizeBrowserLocale(code: string): string {
  if (!code) return 'en';

  // Extract primary language code (first part before hyphen)
  const primary = code.split('-')[0].toLowerCase();

  // Verify it's a real language code by checking if we can get a display name
  try {
    new Intl.DisplayNames('en', { type: 'language' }).of(primary);
    return primary;
  } catch {
    // Invalid language code, fall back to 'en'
    return 'en';
  }
}
