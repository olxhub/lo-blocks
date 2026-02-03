import type { NextRequest } from 'next/server';
import type { RuntimeProps } from '@/lib/types';

/**
 * Select best locale on the server from Accept-Language header.
 *
 * Fails fast if header is missing or availableLocales is empty.
 *
 * @param request - NextRequest with headers
 * @param availableLocales - Array of available BCP 47 locale codes
 * @returns The best matching locale, or first available as fallback
 */
export function getBestLocaleServer(
  request: NextRequest,
  availableLocales: string[]
): string {
  if (!availableLocales || availableLocales.length === 0) {
    throw new Error('getBestLocaleServer: availableLocales cannot be empty');
  }

  const preferredLocale = request.headers.get('accept-language');

  if (preferredLocale && availableLocales.includes(preferredLocale)) {
    return preferredLocale;
  }

  return availableLocales[0];
}

/**
 * Select best locale on the client from Redux.
 *
 * Fails fast if props.runtime.locale is missing.
 *
 * @param props - Component props with runtime.locale.code
 * @param availableLocales - Array of available BCP 47 locale codes
 * @returns The best matching locale, or first available as fallback
 */
export function getBestLocaleClient(
  props: RuntimeProps,
  availableLocales: string[]
): string {
  if (!availableLocales || availableLocales.length === 0) {
    throw new Error('getBestLocaleClient: availableLocales cannot be empty');
  }

  const preferredLocale = props.runtime.locale.code;

  if (preferredLocale && availableLocales.includes(preferredLocale)) {
    return preferredLocale;
  }

  return availableLocales[0];
}

/**
 * Extract locale variant from nested i18n structure with BCP 47 hierarchy fallback.
 *
 * Given a nested structure { locale: data }, extract the requested locale's data
 * with intelligent fallback based on BCP 47 locale hierarchies.
 *
 * Fallback chain:
 * 1. Exact match (e.g., en-Latn-KE)
 * 2. Language-Script (e.g., en-Latn)
 * 3. Language-Region (e.g., en-KE)
 * 4. Language only (e.g., en)
 * 5. First available locale
 *
 * @param langMap - Nested structure { 'en-Latn-US': data, 'ar-Arab-SA': data, ... }
 * @param requestedLocale - BCP 47 locale code to look for (e.g., 'en-Latn-KE')
 * @returns The data for the best matching locale, or undefined if langMap is empty
 */
export function extractLocalizedVariant<T>(
  langMap: Record<string, T>,
  requestedLocale: string
): T | undefined {
  if (!langMap || typeof langMap !== 'object') {
    return undefined;
  }

  const availableLocales = Object.keys(langMap);
  if (availableLocales.length === 0) {
    return undefined;
  }

  // Try exact locale match first
  if (langMap[requestedLocale]) {
    return langMap[requestedLocale];
  }

  // Parse BCP 47 locale code: language[-script[-region]]
  const parts = requestedLocale.split('-');
  const fallbackChain: string[] = [];

  // If we have 3 parts (language-script-region), try language-script and language-region
  if (parts.length === 3) {
    fallbackChain.push(`${parts[0]}-${parts[1]}`); // language-script
    fallbackChain.push(`${parts[0]}-${parts[2]}`); // language-region
  }

  // If we have 2 parts (language-script or language-region), try just language
  if (parts.length >= 2) {
    fallbackChain.push(parts[0]); // language only
  }

  // Try each fallback in priority order
  for (const fallback of fallbackChain) {
    if (langMap[fallback]) {
      return langMap[fallback];
    }
  }

  // Fall back to first available locale
  return langMap[availableLocales[0]];
}
