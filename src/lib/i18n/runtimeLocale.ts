/**
 * Runtime locale updates - encapsulate locale changes in the props/runtime.
 *
 * These utilities update runtime with a new locale while maintaining invariants:
 * - locale.code (UserLocale) always matches locale.dir (LTR/RTL)
 * - Never create mismatched state
 */

import type { UserLocale, LoBlockRuntimeContext } from '@/lib/types';
import { getTextDirection } from './getTextDirection';

/**
 * Type constructors - convert plain strings to branded types safely.
 */
function asUserLocale(code: string): UserLocale {
  if (!code) throw new Error('UserLocale cannot be empty');
  return code as UserLocale;
}

function getBaseVariant(variant: UserLocale | string): string {
  return (variant as string).split(':')[0];
}

/**
 * Update runtime to a new user locale.
 *
 * Encapsulates:
 * - Extracting base language from variant
 * - Computing text direction
 * - Creating new runtime object
 *
 * Usage:
 * ```typescript
 * const newRuntime = updateRuntimeLocale(runtime, 'ar-Arab-SA');
 * return render({ node, runtime: newRuntime });
 * ```
 *
 * @param runtime - Current runtime context
 * @param newLocaleCode - New locale code (BCP 47 or variant like "ar:audio-only")
 * @returns New runtime with updated locale
 */
export function updateRuntimeLocale(
  runtime: LoBlockRuntimeContext,
  newLocaleCode: string
): LoBlockRuntimeContext {
  const userLocale = asUserLocale(newLocaleCode);
  const baseVariant = getBaseVariant(userLocale);
  const dir = getTextDirection(baseVariant);

  return {
    ...runtime,
    locale: {
      code: userLocale,
      dir
    }
  };
}

/**
 * Check if locale has changed between two runtime contexts.
 *
 * Useful for deciding whether to wrap content with a language boundary.
 *
 * @param oldRuntime - Previous runtime
 * @param newRuntime - New runtime
 * @returns true if locale code changed
 */
export function hasLocaleChanged(
  oldRuntime: LoBlockRuntimeContext,
  newRuntime: LoBlockRuntimeContext
): boolean {
  return oldRuntime.locale?.code !== newRuntime.locale?.code;
}

/**
 * Check if direction has changed between two runtime contexts.
 *
 * Useful for deciding whether to update HTML dir attribute.
 *
 * @param oldRuntime - Previous runtime
 * @param newRuntime - New runtime
 * @returns true if direction changed (LTR ↔ RTL)
 */
export function hasDirectionChanged(
  oldRuntime: LoBlockRuntimeContext,
  newRuntime: LoBlockRuntimeContext
): boolean {
  return oldRuntime.locale?.dir !== newRuntime.locale?.dir;
}
