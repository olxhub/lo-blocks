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

  const browserLang = typeof navigator.language === 'string' ? navigator.language : '';

  // Extract primary language code (first part before hyphen)
  const primary = browserLang.split('-')[0].toLowerCase();

  // Only adopt it if it is actually a language subtag. `navigator.language` is
  // not guaranteed to be one: an automation driver launched with no locale
  // configured reports the STRING "undefined", which normalizes to the
  // perfectly truthy "undefined" and gets stored as the user's locale. Nothing
  // downstream can tell that apart from a real choice, so the language control
  // renders "undefined (undefined)" and the bad code persists in the user's
  // settings until it is overwritten by hand. Reject it here, where the
  // untrusted value enters, rather than teaching each reader to doubt it.
  return isValidLocaleCode(primary) ? primary : 'en';
}

/**
 * Is this a well-formed BCP 47 locale code?
 *
 * Deliberately checks WELL-FORMEDNESS, not membership of a known list:
 * translanguaging lets a learner type any code they like, and the point of
 * that feature is to accept languages this codebase has never heard of.
 * `Intl.getCanonicalLocales` is exactly that test — it throws on a malformed
 * tag and accepts every structurally valid one.
 */
export function isValidLocaleCode(code: unknown): code is string {
  if (typeof code !== 'string' || !code.trim()) return false;
  // No Intl (a minimal Node build): fall back to the shape of a language tag —
  // 2–8 letters, then optional -subtag groups.
  if (typeof Intl === 'undefined' || !Intl.getCanonicalLocales) {
    return /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(code.trim());
  }
  try {
    Intl.getCanonicalLocales(code.trim());
    return true;
  } catch {
    return false;
  }
}
