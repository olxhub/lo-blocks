// TODO: Are we reinventing wheels? Should this call into @formatjs/intl-localematcher
// And how will we handle more complex types? en:noaudio es:lowbandwidth, etc.

import type { NextRequest } from 'next/server';
import type { RuntimeProps, UserLocale, ContentVariant, RenderedVariant } from '@/lib/types';

/**
 * Select best variant on the server from Accept-Language header.
 *
 * Requires availableVariants to be non-empty. Throws if empty (indicates malformed content).
 *
 * @param request - NextRequest with headers
 * @param availableVariants - Array of available BCP 47 locale codes (must be non-empty)
 * @returns The best matching variant
 */
export function getBestVariantServer(
  request: NextRequest,
  availableVariants: string[]
): string {
  if (!availableVariants || availableVariants.length === 0) {
    throw new Error('getBestVariantServer: availableVariants cannot be empty');
  }

  const preferredLocale = request.headers.get('accept-language');
  return pickBestVariant(preferredLocale, availableVariants);
}

/**
 * Select best variant on the client from Redux.
 *
 * Fails fast if props.runtime.locale is missing.
 *
 * @param props - Component props with runtime.locale.code
 * @param availableVariants - Array of available BCP 47 locale codes
 * @returns The best matching variant, or first available as fallback
 */
export function getBestVariantClient(
  props: RuntimeProps,
  availableVariants: string[]
): string {
  if (!availableVariants || availableVariants.length === 0) {
    throw new Error('getBestVariantClient: availableVariants cannot be empty');
  }

  const preferredLocale = props.runtime.locale.code;
  return pickBestVariant(preferredLocale, availableVariants);
}

/**
 * Score a locale match on BCP 47 hierarchy.
 *
 * Scoring: exact match (4) > language+script (3) > language+region (2) > language only (1) > no match (0)
 *
 * Used by both pickBestLocale and extractLocalizedVariant, and exported for variant selection.
 *
 * @param requested - BCP 47 locale code (normalized, without Accept-Language qualifiers)
 * @param available - BCP 47 locale code to match against
 * @returns Score 0-4 indicating how well the locales match
 */
export function scoreBCP47Match(requested: string, available: string): number {
  // Parse requested locale: language[-script[-region]]
  const reqParts = requested.split('-');
  const reqLanguage = reqParts[0];
  const reqScript = reqParts.length > 1 && reqParts[1].length === 4 ? reqParts[1] : undefined;
  const reqRegion = reqParts.length > 1 && reqParts[1].length === 2
    ? reqParts[1]
    : (reqParts.length > 2 ? reqParts[2] : undefined);

  // Parse available locale
  const avParts = available.split('-');
  const avLanguage = avParts[0];
  const avScript = avParts.length > 1 && avParts[1].length === 4 ? avParts[1] : undefined;
  const avRegion = avParts.length > 1 && avParts[1].length === 2
    ? avParts[1]
    : (avParts.length > 2 ? avParts[2] : undefined);

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

  return score;
}

function pickBestVariant(
  requestedLocale: string | null | undefined,
  availableVariants: string[]
): string {
  if (!requestedLocale) {
    return availableVariants[0];
  }

  // TODO: Parse full Accept-Language header (q-values, fallback tags).
  // Currently only uses the first tag; ignores "en;q=0.9,ar;q=0.8" fallbacks.
  // Consider @formatjs/intl-localematcher or manual q-value sorting.
  const normalizedLocale = requestedLocale.split(',')[0].trim().split(';')[0].trim();

  if (availableVariants.includes(normalizedLocale)) {
    return normalizedLocale;
  }

  // Find best match using BCP 47 hierarchy
  let bestMatch: { variant: string; score: number } | null = null;

  for (const availableVariant of availableVariants) {
    const score = scoreBCP47Match(normalizedLocale, availableVariant);
    if (score > (bestMatch?.score ?? 0)) {
      bestMatch = { variant: availableVariant, score };
    }
  }

  if (bestMatch && bestMatch.score > 0) {
    return bestMatch.variant;
  }

  // Try generic variant (*) if available
  if (availableVariants.includes('*')) {
    return '*';
  }

  return availableVariants[0];
}

/**
 * Type constructors - convert plain strings to branded types safely.
 */
function asRenderedVariant(code: string): RenderedVariant {
  if (!code) throw new Error('RenderedVariant cannot be empty');
  return code as RenderedVariant;
}

function getBaseVariant(variant: string): string {
  return variant.split(':')[0];
}

/**
 * Select the best content variant for a given user locale.
 *
 * Algorithm:
 * 1. Try exact match (e.g., "en-Latn-US" → "en-Latn-US")
 * 2. Try BCP 47 hierarchy (e.g., "en-Latn-KE" → "en-Latn" → "en")
 * 3. Try feature variants (e.g., "en:audio-only" if "en" requested)
 * 4. Try wildcard variant "*" if available
 * 5. Return first available as last resort
 *
 * @param userLocale - User's current locale (what they can read)
 * @param availableVariants - Content variants available for this content
 * @returns The best matching variant, or null if none available
 */
export function selectBestVariant(
  userLocale: UserLocale,
  availableVariants: (ContentVariant | string)[]
): RenderedVariant | null {
  if (!availableVariants || availableVariants.length === 0) {
    return null;
  }

  const userLocaleStr = userLocale as string;
  const variants = availableVariants as string[];

  // 1. Try exact match
  if (variants.includes(userLocaleStr)) {
    return asRenderedVariant(userLocaleStr);
  }

  // 2. Try BCP 47 hierarchy on base variants (without features)
  const userBase = getBaseVariant(userLocaleStr);
  let bestMatch: { variant: string; score: number } | null = null;

  for (const variant of variants) {
    const variantBase = getBaseVariant(variant);

    // Score BCP 47 match (e.g., "en-Latn-KE" vs "en-Latn" scores 3)
    const score = scoreBCP47Match(userBase, variantBase);

    if (score > (bestMatch?.score ?? 0)) {
      bestMatch = { variant, score };
    }
  }

  if (bestMatch && bestMatch.score > 0) {
    return asRenderedVariant(bestMatch.variant);
  }

  // 3. Try wildcard variant "*"
  if (variants.includes('*')) {
    return asRenderedVariant('*');
  }

  // 4. Last resort: first available
  return asRenderedVariant(variants[0]);
}

/**
 * Extract variant from nested i18n structure with BCP 47 hierarchy fallback.
 *
 * Given a nested structure { variant: data }, extract the requested variant's data
 * with intelligent fallback based on BCP 47 locale hierarchies.
 *
 * Fallback chain:
 * 1. Exact match (e.g., en-Latn-KE)
 * 2. Language-Script (e.g., en-Latn)
 * 3. Language-Region (e.g., en-KE)
 * 4. Language only (e.g., en)
 * 5. Generic variant (*) if available
 * 6. First available variant
 *
 * @param variantMap - Nested structure { 'en-Latn-US': data, 'ar-Arab-SA': data, ... }
 * @param requestedLocale - BCP 47 locale code to look for (e.g., 'en-Latn-KE')
 * @returns The data for the best matching variant, or undefined if variantMap is empty
 */
export function extractLocalizedVariant<T>(
  variantMap: Record<string, T>,
  requestedLocale: string
): T | undefined {
  if (!variantMap || typeof variantMap !== 'object') {
    return undefined;
  }

  const availableVariants = Object.keys(variantMap);
  if (availableVariants.length === 0) {
    return undefined;
  }

  // Try exact variant match first
  if (variantMap[requestedLocale]) {
    return variantMap[requestedLocale];
  }

  // Find best match using BCP 47 hierarchy
  let bestMatch: { variant: string; score: number } | null = null;

  for (const availableVariant of availableVariants) {
    const score = scoreBCP47Match(requestedLocale, availableVariant);
    if (score > (bestMatch?.score ?? 0)) {
      bestMatch = { variant: availableVariant, score };
    }
  }

  if (bestMatch && bestMatch.score > 0) {
    return variantMap[bestMatch.variant];
  }

  // Try generic variant (*) if available
  if (variantMap['*']) {
    return variantMap['*'];
  }

  // Fall back: prefer human-authored (non-generated) content over translations.
  // Uses duck-typing so this works for OlxJson variant maps (which have a generated
  // field) and is a no-op for simpler T types like strings.
  const preferred = availableVariants.find(v => {
    const val = variantMap[v] as any;
    return val && typeof val === 'object' && !val.generated;
  });
  return variantMap[preferred || availableVariants[0]];
}

