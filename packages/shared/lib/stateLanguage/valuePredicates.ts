// packages/shared/lib/stateLanguage/valuePredicates.ts
//
// Value-state predicates: "what does this stored value MEAN?"
//
// Expressions gate progress (`--- wait isFilled(@x.value) ---`) and will soon
// feed aggregates (`sum`, `average`, `count`) that must skip missing values.
// Both questions are really one question asked of a stored value: is there a
// response here?
//
// The honest answer is that a value alone often cannot say. `false` from a
// True/False ChoiceInput is an answer; `false` from an unchecked Done block is
// its absence. `0` from a NumberInput is an answer; a default SortableInput
// arrangement is not an answer until the student drags something, and the
// stored value is identical either way. So this module deliberately does NOT
// ship one clever predicate. It ships the few that a value CAN answer on its
// own, and leaves the contextual ones (`isValid`, `isAnswered`) to a later
// design that can ask the block itself.
//
// The use-case table that pins all of this down lives in
// valuePredicates.test.ts — real blocks × real stored values × how the value
// got there, with an expected truth value per predicate. Read it before
// changing anything here.

import { isFilled } from './evaluate';

/**
 * isTruthy(x) — plain JavaScript truthiness.
 *
 * Exposed because the language has no `!!` and authors reach for `@x.value`
 * in a boolean position anyway; making the coercion explicit means the
 * surprises are visible rather than implicit. And the surprises are real:
 *
 *   isTruthy("0")   → true    (a non-empty string; LineInput stores strings)
 *   isTruthy(0)     → false   (a NumberInput answer of zero)
 *   isTruthy([])    → true    (an empty CheckboxInput selection — arrays are objects)
 *   isTruthy("   ") → true    (a whitespace-only TextArea)
 *   isTruthy(NaN)   → false   (a cleared NumberInput)
 *
 * Which is exactly why it is not the predicate to gate progress on. Use
 * `isFilled` for "did they respond" and `isMissing` for "skip this".
 */
export function isTruthy(value: unknown): boolean {
  return Boolean(value);
}

/**
 * isNumber(x) — a real, finite JavaScript number.
 *
 * `typeof x === 'number'` alone admits `NaN` (what NumberInput's parseFloat
 * selector yields for "" and for "Bob") and `Infinity` (what `1e308 * 10`
 * yields), neither of which is a number you can put in front of a student or
 * average. Strings are NOT numbers here even when they look like one: "3"
 * from a LineInput is a string, and the language does not coerce.
 *
 *   isNumber(0)         → true
 *   isNumber(NaN)       → false
 *   isNumber(Infinity)  → false
 *   isNumber("3")       → false
 *   isNumber(true)      → false
 */
export function isNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * isMissing(x) — there is no response here. The predicate the aggregates need.
 *
 *   isMissing(x)  ===  !isFilled(x) || (typeof x === 'number' && Number.isNaN(x))
 *
 * That is: blank by `isFilled`'s rules (null, undefined, "", whitespace-only,
 * [], {}) — OR a number that is not a number. The NaN clause is the whole
 * reason this exists separately from `!isFilled`: `isFilled(NaN)` is `true`
 * today, because NaN is a `number` and `isFilled` says "a value exists" for
 * numbers. A cleared NumberInput therefore reads as filled, which is wrong for
 * `sum`/`average`/`count` and wrong for gating. `isMissing` is where that is
 * fixed; `isFilled`'s own truth table is left exactly as it is (content
 * depends on it, and the table in the test file documents it as-shipped).
 *
 * Note `isMissing` is NOT `!isFilled` and is not the negation of anything else
 * here — in particular `!isMissing(x)` does not mean "the student answered".
 * `false` from an unchecked Done block is not missing, and is not an answer.
 * That question is `isAnswered`, which is not implemented; see the test file.
 */
export function isMissing(value: unknown): boolean {
  if (!isFilled(value)) return true;
  return typeof value === 'number' && Number.isNaN(value);
}
