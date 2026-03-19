/**
 * Locale utilities - extract and manipulate locale codes from content variants.
 *
 * Handles the relationship between:
 * - ContentVariant: Full variant with language + optional feature flags
 * - Locale: Just the language part (no feature flags)
 */

import type { ContentVariant, Locale } from '@/lib/types';

/**
 * Extract the language locale from a content variant.
 *
 * CURRENT BEHAVIOR (no feature variants yet):
 * - Returns the variant as-is (it's already just a locale code)
 * - Acts as a no-op for type safety and clarity
 *
 * FUTURE BEHAVIOR (when feature variants are added):
 * - Parses compound variants: "en-Latn-US:audio-only" → "en-Latn-US"
 * - Strips all feature flags, returns only the language part
 * - Handles wildcard: "*" → throws error (no language to extract)
 *
 * @param variant - A ContentVariant (e.g., "en-Latn-US", "en-Latn-US:audio-only")
 * @returns The language locale part (e.g., "en-Latn-US")
 * @throws Error if variant is wildcard "*" (no language to extract)
 *
 * @example
 * // Current (no feature variants yet)
 * localeFromVariant("en-Latn-US" as ContentVariant) → "en-Latn-US" as Locale
 * localeFromVariant("ar-Arab-SA" as ContentVariant) → "ar-Arab-SA" as Locale
 *
 * // Future (with feature variants)
 * localeFromVariant("en-Latn-US:audio-only" as ContentVariant) → "en-Latn-US" as Locale
 * localeFromVariant("es-Latn-ES:vision-impaired" as ContentVariant) → "es-Latn-ES" as Locale
 */
export function localeFromVariant(variant: ContentVariant): Locale {
  // Current: variants are just locale codes, return as-is
  // (type cast tells TypeScript this is a Locale, not a full ContentVariant)
  //
  // Future: Parse out feature flags
  // const [locale] = variant.split(':');
  // if (!locale || locale === '*') throw new Error(`Cannot extract locale from variant: ${variant}`);
  // return locale as Locale;

  return variant as unknown as Locale;
}
