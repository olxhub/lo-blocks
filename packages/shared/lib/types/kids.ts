// packages/shared/lib/types/kids.ts
//
// Type assertion helpers for narrowing JSONValue `kids` in block components.
//
// TODO: These belong in lib/types.ts (they're type infrastructure for JSONValue,
// not utility functions). Move on the next major types.ts change to avoid
// import churn as a standalone move.

import type { JSONValue, KidEntry } from '@/lib/types';

/** Assert that kids is a string. Throws with a clear message if not. */
export function assertString(value: JSONValue): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected string kids, got ${value === null ? 'null' : typeof value}`);
  }
}

/** Assert that kids is a KidEntry[]. Throws if not an array. */
export function assertKidArray(value: JSONValue): asserts value is KidEntry[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected array kids, got ${value === null ? 'null' : typeof value}`);
  }
}

/** Type predicate for mixed-type components that handle both string and array kids. */
export function isKidArray(value: JSONValue): value is KidEntry[] {
  return Array.isArray(value);
}

/**
 * Assert that kids is a plain object with the given named keys.
 * Runtime check: verifies non-null, non-array object.
 * Type narrowing: narrows to `{ [P in K]: JSONValue }`.
 *
 * TODO: Add required vs optional key validation (runtime check that required keys exist).
 * TODO: Consider zod integration for richer schema validation of parsed kids.
 */
export function assertNamedObject<K extends string>(
  value: JSONValue, keys: readonly K[]
): asserts value is { [P in K]: JSONValue } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Expected object kids with [${keys}], got ${Array.isArray(value) ? 'array' : typeof value}`);
  }
}
