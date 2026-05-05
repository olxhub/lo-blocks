/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTERNATIONALIZATION TYPES: Locale, UserLocale, ContentVariant, RenderedVariant
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * These branded types prevent confusion between different semantic concepts in the
 * i18n pipeline. Each represents a distinct role:
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ LOCALE - A single language code, extracted from variants                    │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ What: A BCP 47 language tag for a single language (no feature flags)        │
 * │ Examples: "en-Latn-US", "ar-Arab-SA", "pl-Latn-PL", "es-Latn-ES"           │
 * │ Source: Extracted from ContentVariants by stripping feature flags           │
 * │ Usage: Content selection, language switcher UI, user preferences            │
 * │ Current: Identical to ContentVariant at runtime (no feature flags yet)      │
 * │ Future: Feature variants like "en-Latn-US:audio-only" will be parsed to    │
 * │         extract just "en-Latn-US" via localeFromVariant()                  │
 * │                                                                              │
 * │ Helper: localeFromVariant(variant: ContentVariant) → Locale                │
 * │   - Current: No-op (variants are just locales)                             │
 * │   - Future: Parses compound variants, returns language part                │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ USER LOCALE - What the user prefers to read                                │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ What: User's language preference/setting                                   │
 * │ Current: A single Locale (e.g., "en-Latn-US")                             │
 * │ Source: Browser language → Redux settings → author override (lang= attr)   │
 * │ Usage: Select content variant to render, configure UI language            │
 * │                                                                              │
 * │ FUTURE EVOLUTION:                                                           │
 * │ As platform matures, UserLocale will become more sophisticated:            │
 * │                                                                              │
 * │ Option A: Polyglot Users                                                   │
 * │   type UserLocale = {                                                      │
 * │     preferred: Locale[];  // [en-Latn-US, pl-Latn-PL, fr-Latn-FR]       │
 * │     fallback: Locale;                                                      │
 * │   }                                                                         │
 * │   Use case: Teachers in multilingual communities reading in 2-3 languages  │
 * │   Selection: Try each preferred locale; fall back if not available        │
 * │                                                                              │
 * │ Option B: Feature Preferences                                              │
 * │   type UserLocale = {                                                      │
 * │     locale: Locale;                                                        │
 * │     features: {                                                            │
 * │       audioEnabled: boolean;    // Prefer audio when available            │
 * │       highContrast: boolean;    // Prefer high-contrast visuals           │
 * │       fontSize: 'normal' | 'large' | 'xlarge';                          │
 * │     };                                                                      │
 * │   }                                                                         │
 * │   Use case: Accessibility preferences, low-bandwidth mode                 │
 * │   Selection: Match feature preferences alongside language                 │
 * │                                                                              │
 * │ Both: Combined                                                              │
 * │   type UserLocale = {                                                      │
 * │     preferred: Locale[];  // Polyglot support                            │
 * │     features: FeaturePreferences;  // Accessibility + context             │
 * │   }                                                                         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ CONTENT VARIANT - What's available in content                              │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ What: A key representing available language/feature combination in content │
 * │ Examples:                                                                   │
 * │   Current: "en-Latn-US", "ar-Arab-SA", "pl-Latn-PL"                      │
 * │   Future: "en-Latn-US", "en-Latn-US:audio-only", "en:low-bandwidth",     │
 * │           "ar-Arab-SA:vision-impaired", "*" (catch-all)                  │
 * │ Source: idMap keys (from file-level metadata in OLX)                     │
 * │ Storage: idMap[blockId][variant] = OlxJson                              │
 * │ Usage: Variant selection/matching, content storage structure             │
 * │                                                                              │
 * │ Structure: language[:feature][:feature]...                               │
 * │   - language: BCP 47 tag (e.g., "en-Latn-US")                           │
 * │   - feature: accessibility/context modifier (e.g., "audio-only")        │
 * │   - "*": Wildcard fallback matching any variant                         │
 * │                                                                              │
 * │ Selection Algorithm (getBestVariant):                                      │
 * │   1. Try exact UserLocale match                                           │
 * │   2. Try language + matching features                                     │
 * │   3. Try language only (discard feature preferences)                     │
 * │   4. Try language parent (en-Latn-US → en-Latn → en)                   │
 * │   5. Try wildcard "*"                                                    │
 * │   6. Error: no variant available                                         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ RENDERED VARIANT - The selected variant to render                          │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ What: A ContentVariant that has been selected via getBestVariant*         │
 * │ Usage: Marks that this variant has been "chosen" and is being rendered   │
 * │ Purpose: Prevents re-selection; enables caching and memoization         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * MIGRATION PATH FOR FUTURE FEATURE VARIANTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Phase 1 (Current):
 * - ContentVariant is just locale codes
 * - localeFromVariant() is a no-op
 * - All code treats variants and locales identically
 *
 * Phase 2 (Near Future):
 * - Add support for compound variants: "en-Latn-US:audio-only"
 * - localeFromVariant() parses and extracts language part
 * - LanguageSwitcher filters out non-language variants for UI
 * - Content storage unchanged (idMap[blockId][fullVariant] = OlxJson)
 *
 * Phase 3 (Longer Term):
 * - UserLocale evolves to support preferences/polyglot
 * - getBestVariant matches both language and feature preferences
 * - LanguageSwitcher shows language options with feature indicators
 * - SelectVariant selector becomes more sophisticated (feature filtering)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { z } from 'zod';

type I18nBrand<Name extends string> = { readonly __brand: Name };

/** A single language code, extracted from variants by stripping feature flags */
export type Locale = string & I18nBrand<'Locale' | 'UserLocale'>;

/** What the user prefers to read (browser → Redux → author override) */
export type UserLocale = string & I18nBrand<'UserLocale'>;

/** A language/accessibility/context variant available for content (e.g., "ar-Arab-SA", "en:audio-only") */
export type ContentVariant = string & I18nBrand<'ContentVariant' | 'RenderedVariant'>;

/** The variant we actually render - a ContentVariant selected via getBestVariant* functions */
export type RenderedVariant = string & I18nBrand<'RenderedVariant'>;

const FEATURE_TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Canonicalize and validate BCP 47 syntax using the platform Intl API.
 *
 * Important limitation: Intl.getCanonicalLocales validates that a tag is
 * structurally well-formed and returns canonical casing/order. It does not
 * prove that the language/region/script subtags are known locales we support.
 *
 * Example results observed in Node:
 * - "en-US" -> "en-US"
 * - "en_US" -> RangeError
 * - "not a locale" -> RangeError
 * - "zz-xx-1211" -> "zz-XX-1211"
 *
 * That last case is the trap: it is syntactically acceptable to Intl, but not
 * a useful real locale for our product. We should add a second validation
 * layer backed by cldr-core/availableLocales.json. That data is already
 * importable in client and server bundles via lib/i18n/languages.ts, but exact
 * membership is not enough by itself: CLDR includes "en" and "ar-SA", while
 * common canonical tags like "en-US" and "zh-Hans-CN" may need
 * canonical/minimized/maximized matching rather than a direct Set.has(tag).
 */
function canonicalLocale(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Locale cannot be empty');
  return Intl.getCanonicalLocales(trimmed)[0];
}

// Unchecked casts for values already inside the type system. Boundary
// constructors below remain responsible for runtime validation.
const asContentVariant = (value: string): ContentVariant => value as ContentVariant;

export const z_locale = z.string()
  .transform((value, ctx) => {
    try {
      return canonicalLocale(value) as Locale;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid BCP 47 language tag',
      });
      return z.NEVER;
    }
  });

export const z_userLocale = z_locale.transform(value => value as UserLocale);

export const z_contentVariant = z.string()
  .transform((value, ctx) => {
    const trimmed = value.trim();
    if (trimmed === '*') return asContentVariant('*');

    const [localePart, ...features] = trimmed.split(':');
    let locale: Locale;
    try {
      locale = z_locale.parse(localePart);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Content variant must start with a BCP 47 language tag or be "*"',
      });
      return z.NEVER;
    }

    const invalidFeature = features.find(feature => !FEATURE_TOKEN.test(feature));
    if (invalidFeature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid content variant feature "${invalidFeature}"`,
      });
      return z.NEVER;
    }

    return features.length > 0
      ? asContentVariant(`${locale}:${features.join(':')}`)
      : asContentVariant(locale);
  });

export const z_renderedVariant = z_contentVariant.transform(value => value as RenderedVariant);

export const toLocale = (value: string): Locale => z_locale.parse(value);
export const toUserLocale = (value: string): UserLocale => z_userLocale.parse(value);
export const toContentVariant = (value: string): ContentVariant => z_contentVariant.parse(value);
export const toRenderedVariant = (value: string): RenderedVariant => z_renderedVariant.parse(value);

/**
 * Generic record whose keys are ContentVariant values.
 * Used for variant-keyed metadata/status maps, e.g. localized titles or
 * supported/best-effort availability.
 *
 * Do not call this VariantMap: that name is already used codebase-wide for
 * content storage maps whose values are OlxJson.
 */
export type VariantKeyedRecord<T> = Record<ContentVariant, T>;

export function variantMapKeys<T>(variantMap: VariantKeyedRecord<T>): ContentVariant[] {
  return Object.keys(variantMap).map(asContentVariant);
}

/** Like variantMapKeys but excludes the '*' wildcard — returns only real locales. */
export function variantMapLocales<T>(variantMap: VariantKeyedRecord<T>): ContentVariant[] {
  return Object.keys(variantMap).filter(k => k !== '*').map(asContentVariant);
}

export function variantMapEntries<T>(variantMap: VariantKeyedRecord<T>): [ContentVariant, T][] {
  return Object.entries(variantMap).map(([variant, value]) => [
    asContentVariant(variant),
    value as T,
  ]);
}

/** Like variantMapEntries but excludes the '*' wildcard. */
export function variantMapLocaleEntries<T>(variantMap: VariantKeyedRecord<T>): [ContentVariant, T][] {
  return Object.entries(variantMap)
    .filter(([k]) => k !== '*')
    .map(([variant, value]) => [asContentVariant(variant), value as T]);
}

/**
 * LocaleContext - language and text direction configuration.
 *
 * Enables i18n throughout the platform. For now, `dir` comes from Redux settings.
 * Future: derive `dir` from Intl.Locale.getTextInfo() when browser support is universal.
 */
export interface LocaleContext {
  code: UserLocale;  // BCP 47 locale code: 'en-Latn-US', 'zh-Hans-CN', 'ar-Arab-SA', 'pl-Latn-PL', 'tr-TR'
  dir: 'ltr' | 'rtl';  // Text direction from Redux settings
}
