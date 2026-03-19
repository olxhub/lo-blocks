/**
 * Determine text direction (LTR or RTL) for a BCP 47 locale code.
 *
 * Note: As of early 2026, Firefox doesn't support Intl.Locale.prototype.getTextInfo().
 * This will become the primary method once browser support is universal.
 *
 * For now, we try the Intl API and fall back to a hardcoded set of RTL language codes.
 *
 * Safe for use in both browser and Node.js environments (guards against missing APIs).
 *
 * @param localeCode - BCP 47 locale code (e.g., 'en-Latn-US', 'ar-Arab-SA', 'he-IL')
 * @returns 'ltr' for left-to-right, 'rtl' for right-to-left
 */
export function getTextDirection(localeCode: string): 'ltr' | 'rtl' {
  // RTL language codes (ISO 639-1 / ISO 639-3)
  // Arabic, Hebrew, Farsi/Persian, Urdu, Pashto, Dhivehi
  const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'dv']);

  // Try modern Intl API (supported in most browsers except Firefox as of 2026)
  if (typeof globalThis !== 'undefined' && globalThis.Intl) {
    try {
      // @ts-ignore - getTextInfo() not in TypeScript yet
      const textInfo = new Intl.Locale(localeCode).getTextInfo();
      if (textInfo && textInfo.direction) {
        return textInfo.direction;
      }
    } catch {
      // Intl.Locale not available or getTextInfo() failed - fall through to fallback
    }
  }

  // Fallback: extract language code from locale and check against known RTL languages
  const languageCode = localeCode.split('-')[0].toLowerCase();
  return RTL_LANGS.has(languageCode) ? 'rtl' : 'ltr';
}

/**
 * Get browser's preferred locale code.
 *
 * Returns the best guess at user's locale from navigator.language or navigator.languages.
 * Normalizes to primary language code (e.g., 'en-US' -> 'en', 'fr-CA' -> 'fr').
 * Safe for use in both browser and Node.js (returns 'en' if not in browser).
 *
 * @returns BCP 47 locale code (primary language only)
 */
export function getBrowserLocale(): string {
  if (typeof navigator === 'undefined') {
    return 'en';  // Node.js environment
  }

  const browserLang = navigator.language || 'en';

  // Extract primary language code (first part before hyphen)
  return browserLang.split('-')[0].toLowerCase();
}
