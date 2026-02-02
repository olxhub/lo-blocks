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
 * Extract locale variant from nested i18n structure.
 *
 * Given a nested structure { locale: data }, extract the requested locale's data
 * with fallback to the first available locale if requested locale is not found.
 *
 * This handles the common pattern: try exact locale match, fall back to first available.
 *
 * @param langMap - Nested structure { 'en-Latn-US': data, 'ar-Arab-SA': data, ... }
 * @param requestedLocale - BCP 47 locale code to look for (e.g., 'en-Latn-US')
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

  // Fall back to first available locale
  return langMap[availableLocales[0]];
}
