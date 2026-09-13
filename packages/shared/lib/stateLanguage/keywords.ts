// packages/shared/lib/stateLanguage/keywords.ts
//
// Reserved keyword registry for the expression language.
//
// Three tiers control how identifiers interact with the expression language:
//
// 1. ACTIVE METHODS — implemented, part of the language today. These names
//    resolve as methods on arrays/strings, never as field access.
//
// 2. RESERVED KEYWORDS — not yet implemented, but reserved so block authors
//    can't claim them as field or attribute names. When we implement one,
//    it moves to tier 1.
//
// 3. AMBIGUOUS (comments only) — could go either way. If a block starts
//    using one as a field/attribute, it becomes impossible as a keyword.
//    If we implement it as a method, it becomes reserved. These are listed
//    in comments below for tracking, not enforced.
//
// Validation:
//   - Block field names are checked against RESERVED_KEYWORDS at
//     registration time (fields.ts).
//   - Block attribute names are checked at registration time (factory.tsx).
//   - The evaluator resolves member access and method calls through the
//     member table in methods.ts; ACTIVE_METHODS is that table's value-kind
//     vocabulary, re-exported here so tier 2 stays a superset of tier 1.

import { ACTIVE_MEMBER_NAMES } from './methods';

// ─── Tier 1: Active methods ────────────────────────────────────────────
//
// Implemented and formally part of the expression language. This set is
// DERIVED from the member table in methods.ts — the single place where the
// language's vocabulary is defined — so a name can never be active in the
// evaluator while unreserved here, or reserved here while unimplemented.
//
// Only members of VALUES (arrays, strings, numbers, booleans) appear:
// those are the names that would otherwise collide with a block's field
// names. Namespace members (Math.round, Object.keys) are reached only
// through their namespace identifier, which is reserved on its own below,
// so blocks keep fields called `min`, `max` or `round`.

export const ACTIVE_METHODS: ReadonlySet<string> = ACTIVE_MEMBER_NAMES;

// ─── Tier 2: Reserved keywords ─────────────────────────────────────────
//
// Can't be used as block field or attribute names. Includes everything
// from tier 1 plus names we're likely to want in the future.

export const RESERVED_KEYWORDS = new Set([
  // Tier 1 (active methods — re-listed here for validation)
  ...ACTIVE_METHODS,

  // Future array/string methods
  'reduce',
  'indexOf',
  'slice',
  'concat',
  'sort',
  'reverse',
  'flat',
  'flatMap',
  'trim',
  'startsWith',
  'endsWith',
  'split',
  'replace',
  'toLowerCase',
  'toUpperCase',
  'keys',
  'entries',

  // Operators and keywords
  'in',
  'of',
  'typeof',
  'instanceof',
  'not',
  'and',
  'or',

  // Literals and built-in identifiers
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',

  // Built-in namespaces
  'Math',
  'Object',
  'correctness',
  'completion',

  // Built-in functions
  'wordcount',
  'isFilled',
  'text2markdown',
  'formatDuration',
  'stringMatch',
  'numericalMatch',
]);

// ─── Tier 3: Ambiguous ─────────────────────────────────────────────────
//
// These names could plausibly become either expression-language methods or
// block field/attribute names. They are NOT enforced — just documented here
// so we can track which side of the fence they fall on over time.
//
// When one of these becomes a field/attribute in a block, it's permanently
// impossible as a keyword. When we implement one as a method or operator,
// move it to RESERVED_KEYWORDS above.
//
// Currently ambiguous:
//   size        - could be a collection method or a display attribute
//   count       - could be an aggregation method or a state field (DynamicList)
//   text        - could be a type coercion method or a content field
//   contains    - synonym for includes; could be a method or a field
//   empty       - could be a predicate method or a state flag
//   first/last  - could be array accessors or positional attributes
//   has         - could be a set/map method or a boolean field
//   toString    - could be a coercion method (but prototype-y)
//   at          - could be an array accessor (arr.at(-1))

/**
 * Check whether a name is reserved. Call this from block registration
 * to prevent field/attribute names from colliding with language keywords.
 */
export function assertNotReserved(name: string, context: string): void {
  if (RESERVED_KEYWORDS.has(name)) {
    throw new Error(
      `${context}: "${name}" is a reserved expression-language keyword ` +
      `and cannot be used as a field or attribute name.`
    );
  }
}
