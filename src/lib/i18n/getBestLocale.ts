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
  return pickBestLocale(preferredLocale, availableLocales);
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
  return pickBestLocale(preferredLocale, availableLocales);
}

function pickBestLocale(
  requestedLocale: string | null | undefined,
  availableLocales: string[]
): string {
  if (!requestedLocale) {
    return availableLocales[0];
  }

  // Accept-Language can include a list; take the first tag if present.
  const normalizedLocale = requestedLocale.split(',')[0].trim();

  if (availableLocales.includes(normalizedLocale)) {
    return normalizedLocale;
  }

  // Parse requested locale: language[-script[-region]]
  const reqParts = normalizedLocale.split('-');
  const reqLanguage = reqParts[0];
  const reqScript = reqParts.length > 1 && reqParts[1].length === 4 ? reqParts[1] : undefined;
  const reqRegion = reqParts.length > 1 && reqParts[1].length === 2
    ? reqParts[1]
    : (reqParts.length > 2 ? reqParts[2] : undefined);

  let bestMatch: { locale: string; score: number } | null = null;

  for (const availableLocale of availableLocales) {
    const avParts = availableLocale.split('-');
    const avLanguage = avParts[0];
    const avScript = avParts.length > 1 && avParts[1].length === 4 ? avParts[1] : undefined;
    const avRegion = avParts.length > 1 && avParts[1].length === 2
      ? avParts[1]
      : (avParts.length > 2 ? avParts[2] : undefined);

    // Score matching: exact match (4) > language+script (3) > language+region (2) > language only (1) > no match (0)
    let score = 0;
    if (avLanguage === reqLanguage) {
      score = 1; // Language matches
      if (avScript && reqScript && avScript === reqScript) {
        score = 3; // Language + script match
      }
      if (avRegion && reqRegion && avRegion === reqRegion) {
        score = Math.max(score, 2); // Language + region match
      }
      if (avScript === reqScript && avRegion === reqRegion) {
        score = 4; // All parts match (exact or equivalent)
      }
    }

    if (score > (bestMatch?.score ?? 0)) {
      bestMatch = { locale: availableLocale, score };
    }
  }

  if (bestMatch && bestMatch.score > 0) {
    return bestMatch.locale;
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

  // Parse requested locale: language[-script[-region]]
  const reqParts = requestedLocale.split('-');
  const reqLanguage = reqParts[0];
  const reqScript = reqParts.length > 1 && reqParts[1].length === 4 ? reqParts[1] : undefined;
  const reqRegion = reqParts.length > 1 && reqParts[1].length === 2 ? reqParts[1] : (reqParts.length > 2 ? reqParts[2] : undefined);

  // Try to match against available locales using fallback hierarchy
  // For each available locale, extract its components and score the match
  let bestMatch: { locale: string; score: number } | null = null;

  for (const availableLocale of availableLocales) {
    const avParts = availableLocale.split('-');
    const avLanguage = avParts[0];
    const avScript = avParts.length > 1 && avParts[1].length === 4 ? avParts[1] : undefined;
    const avRegion = avParts.length > 1 && avParts[1].length === 2 ? avParts[1] : (avParts.length > 2 ? avParts[2] : undefined);

    // Score matching: exact match (4) > language+script (3) > language+region (2) > language only (1) > no match (0)
    let score = 0;
    if (avLanguage === reqLanguage) {
      score = 1; // Language matches
      if (avScript && reqScript && avScript === reqScript) {
        score = 3; // Language + script match
      }
      if (avRegion && reqRegion && avRegion === reqRegion) {
        score = Math.max(score, 2); // Language + region match
      }
      if (avScript === reqScript && avRegion === reqRegion) {
        score = 4; // All parts match (exact or equivalent)
      }
    }

    if (score > (bestMatch?.score ?? 0)) {
      bestMatch = { locale: availableLocale, score };
    }
  }

  if (bestMatch && bestMatch.score > 0) {
    return langMap[bestMatch.locale];
  }

  // Fall back to first available locale
  return langMap[availableLocales[0]];
}
