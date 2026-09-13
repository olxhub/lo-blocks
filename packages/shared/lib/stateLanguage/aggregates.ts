// packages/shared/lib/stateLanguage/aggregates.ts
//
// Aggregates over a list: sum, countFilled, average.
//
// These exist so a running score over partially-answered items is
// expressible without the author writing a conditional per item:
//
//   average([@s09.code, @s19.code, @s06.code, @s04.code])
//
// where `.code` is the survey code the selected option carries. Items the
// student hasn't answered yet are SKIPPED, so the score means something from
// the first answer on, and lands somewhere sensible when nothing is answered.
//
// MISSING IS ONE PREDICATE, SHARED. An element is skipped iff
// `isMissing(x)` (valuePredicates.ts): isFilled's blanks — null, undefined,
// "", whitespace-only, [], {} — plus NaN, which is what a cleared
// NumberInput reads as. All three functions use the same test, so
// `countFilled` and `sum` can never disagree about which items exist.
//
// PRECEDENT. SQL AVG/SUM/COUNT(col) skip NULL; Excel AVERAGE/SUM ignore
// blanks; pandas defaults to skipna=True. Skipping is the majority rule and
// the only one under which a partially-answered score is meaningful, so
// there is no opt-out flag: content that depended on propagation would be
// content that depended on a bug. `sum([])` is 0 (identity, and every
// system but SQL agrees); `average([])` is `undefined` rather than NaN or 0,
// because `undefined` is this language's "absent" — it is what an unknown
// ref yields, and what NumberLineInput's `initial=` reads as "fall back to
// the midpoint".
//
// `.length` vs `countFilled`. `.length` is SQL's COUNT(*) — it counts SLOTS,
// including unanswered ones. `countFilled` is COUNT(col) — it counts
// VALUES. `[1, @blank.value].length` is 2 while
// `countFilled([1, @blank.value])` is 1. Them disagreeing by the number of
// blanks is the likeliest author bug in this kind of content, so the two
// names are deliberately not near-synonyms.
//
// PROVISIONAL — TWO FORKS THE OWNER HAS NOT CLOSED. Both are implemented
// here on the recommended branch, flagged at the call site:
//
//   1. A non-missing element that is not a number is a TypeError, not a
//      silent skip and not a coercion (`sum(["1", 2])` throws). See sum().
//   2. Weights are a trailing options object, `{weights: [...]}`, not a
//      positional second list. See average().
//
// If either is reversed, it is a SEMANTIC change with no parse error
// anywhere — every archived response re-scores silently. Change the tests in
// aggregates.test.ts in the same commit, deliberately.

import { isMissing } from './valuePredicates';

/**
 * Describe a received value for an error message, briefly and safely.
 * Author-side errors fail loudly, so the message has to say what arrived.
 */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `a list of ${value.length}`;
  if (typeof value === 'string') return `string ${JSON.stringify(value)}`;
  if (typeof value === 'object') return 'an object';
  return `${typeof value} ${String(value)}`;
}

/** Every aggregate takes exactly one list. A non-list is an author error. */
function requireList(value: unknown, fn: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fn}() expects a list, got ${describe(value)}`);
  }
  return value;
}

/**
 * A non-missing element must be a number.
 *
 * NOT a coercion and NOT a silent skip (fork 1 above). A raw string reaching
 * `sum` means the author read `.value` where they meant `.code`, or wrote a
 * code as text — that should be loud, at authoring time, rather than
 * producing a plausible wrong number. "Numeric string" is also a
 * locale-and-format question ('1e3', '3,5') that an archival format should
 * not answer implicitly.
 *
 * `Infinity` is admitted: it is a number, it is not missing, and §2 of the
 * design note says `sum([1e308, 1e308])` is `Infinity`. (The predicate
 * table calls this open — `isNumber` excludes non-finite values. If the
 * owner closes it the other way, tighten here and nowhere else.)
 */
function requireNumber(value: unknown, fn: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(
      `${fn}() expects numbers, got ${describe(value)}. ` +
      `The expression language does not coerce — if this is a survey code, read .code, not .value.`
    );
  }
  return value;
}

/**
 * sum(list) — total of the non-missing elements.
 *
 *   sum([1, 2, 3])                → 6
 *   sum([1, @blank.value, 2])     → 3      (missing skipped)
 *   sum([])                       → 0      (identity)
 *   sum(["1", 2])                 → TypeError
 *   sum([true, 1])                → TypeError   (count trues with .filter(v => v).length)
 *   sum(3)                        → TypeError   (one list argument, not varargs)
 */
export function sum(list: unknown): number {
  const items = requireList(list, 'sum');
  let total = 0;
  for (const item of items) {
    if (isMissing(item)) continue;
    total += requireNumber(item, 'sum');
  }
  return total;
}

/**
 * countFilled(list) — how many elements have a value.
 *
 * SQL's COUNT(col). Any type counts, so `0` and `false` are values:
 *
 *   countFilled([@a.value, @blank.value, 0, false])  → 3
 *   countFilled(["  ", [], {}])                      → 0   (isFilled's blanks)
 *   countFilled([])                                  → 0
 *
 * The name says what is being counted, because "count of what?" is only
 * obvious inside a column context (pandas, SQL); the row-wise tools all name
 * the qualifier — SPSS NVALID, SAS N, Stata rownonmiss.
 *
 * THE CHECKBOX CASE. For ONE CheckboxInput the stored value is already the
 * array of selected ids, so "did they pick 2?" is
 * `@cb.value.length === 2` — `.length` stays the idiom there, and
 * `countFilled` would be the wrong tool (it would count the ids, all of
 * which are filled). `countFilled` is for ACROSS inputs: "answered at least
 * 3 of these 5", where an empty checkbox array is one blank item,
 * consistent with isFilled.
 */
export function countFilled(list: unknown): number {
  const items = requireList(list, 'countFilled');
  let n = 0;
  for (const item of items) {
    if (!isMissing(item)) n++;
  }
  return n;
}

/** The options `average` accepts. Unknown keys throw, so typos fail loudly. */
const AVERAGE_OPTIONS = ['weights'];

function readOptions(options: unknown, fn: string): { weights?: unknown[] } {
  if (options === undefined) return {};
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(`${fn}() expects an options object, got ${describe(options)}`);
  }
  // Object literals are built with a null prototype (evaluate.ts), so own
  // keys are exactly the keys the author wrote.
  for (const key of Object.keys(options)) {
    if (!AVERAGE_OPTIONS.includes(key)) {
      throw new TypeError(
        `${fn}(): unknown option "${key}". Known options: ${AVERAGE_OPTIONS.join(', ')}`
      );
    }
  }
  const weights = (options as Record<string, unknown>).weights;
  if (weights !== undefined && !Array.isArray(weights)) {
    throw new TypeError(`${fn}(): weights must be a list, got ${describe(weights)}`);
  }
  return { weights: weights as unknown[] | undefined };
}

/**
 * average(list, {weights?}) — mean of the non-missing elements.
 *
 *   average([1, 2, 3, @blank.value])          → 2
 *   average([])                               → undefined   (not NaN, not 0)
 *   average([@blank.value, @gone.value])      → undefined
 *   average([1, 2, 3], {weights: [1, 1, 2]})  → 2.25
 *
 * WEIGHTS ARE PAIR-DROPPED. A value and its weight are dropped together when
 * EITHER is missing — R's `weighted.mean(na.rm = TRUE)`, and the only
 * coherent rule once values can be missing (NumPy drops nothing and
 * requires matching lengths):
 *
 *   average([1, @blank.value, 3], {weights: [1, 5, 1]})  → 2
 *   average([1, 2, 3], {weights: [1, @gone.value, 1]})   → 2
 *
 * A length mismatch is an author error, not a pairing to guess at:
 *
 *   average([1, 2], {weights: [1, 5, 1]})     → TypeError
 *
 * A total weight of zero has no mean to report, by exhaustion or by
 * cancellation, so it is absent rather than a division:
 *
 *   average([1, 2], {weights: [0, 0]})        → undefined
 *   average([1, 2], {weights: [1, -1]})       → undefined
 *
 * Returning `undefined` rather than throwing is deliberate: an empty or
 * all-blank list is a STUDENT state (nobody has answered yet), and student
 * states never throw — the display skips them, and a NumberLineInput
 * `initial=` falls back to its midpoint. Only author errors throw.
 */
export function average(list: unknown, options?: unknown): number | undefined {
  const items = requireList(list, 'average');
  const { weights } = readOptions(options, 'average');

  if (weights === undefined) {
    let total = 0;
    let n = 0;
    for (const item of items) {
      if (isMissing(item)) continue;
      total += requireNumber(item, 'average');
      n++;
    }
    return n === 0 ? undefined : total / n;
  }

  if (weights.length !== items.length) {
    throw new TypeError(
      `average(): weights has ${weights.length} entries but the list has ${items.length}`
    );
  }

  let weighted = 0;
  let totalWeight = 0;
  for (let i = 0; i < items.length; i++) {
    const value = items[i];
    const weight = weights[i];
    // Pair-dropped: either one missing drops both.
    if (isMissing(value) || isMissing(weight)) continue;
    weighted += requireNumber(value, 'average') * requireNumber(weight, 'average');
    totalWeight += requireNumber(weight, 'average');
  }

  return totalWeight === 0 ? undefined : weighted / totalWeight;
}
