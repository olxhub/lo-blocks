// packages/shared/lib/stateLanguage/valuePredicates.test.ts
//
// ════════════════════════════════════════════════════════════════════════
// THE VALUE-STATE PREDICATE TABLE
// ════════════════════════════════════════════════════════════════════════
//
// A predicate over a stored value ("is there an answer here?") is only as
// good as the use cases it gets right. This file is the list of use cases:
// real blocks × the value they actually store × how the value got there,
// each with an expected truth value for every predicate. The implemented
// predicates run against it; the ones we cannot implement yet are here with
// their expectations filled in as far as they are knowable.
//
// THREE RULES FOR THIS TABLE:
//
//   1. These expectations MAY BE CHANGED if they turn out not to make sense.
//      Nothing here is settled by being written down; if a cell is wrong,
//      fix the cell (and say why in its note).
//
//   2. These expectations MUST NOT BE DELETED unless they are replaced with a
//      different set. Dropping a row or a column because it is inconvenient
//      loses the use case, which is the only thing of value here. A predicate
//      that no longer exists takes its row with it; a use case does not go
//      away because it is hard.
//
//   3. THE POINT IS THE USE CASES, not the predicates. The predicates are
//      cheap and replaceable. The list of situations a student can actually
//      put a block into — and what each one stores — is the expensive part,
//      and it is what a later `isValid`/`isAnswered` has to be designed
//      against.
//
// ── Why more than one predicate ─────────────────────────────────────────
//
// What a stored value MEANS is contextual. `false` from a True/False
// ChoiceInput is an answer; `false` from an unchecked Done block is the
// absence of one. `0` from a NumberInput is an answer. A SortableInput that
// the student has never touched stores the same `{ arrangement: [...] }` as
// one they have painstakingly reordered into the same sequence — no
// predicate over the value can tell those apart, which is exactly why
// `isAnswered` is not implemented here rather than implemented wrongly.
//
// ── The table ───────────────────────────────────────────────────────────
//
// (Rendered with use cases down the page and predicates across, which is the
// design table transposed — 31 columns do not fit on a line.)
//
//                                                 fil tru num mis | val ans
//   LineInput/typed "1"             "1"            T   T   F   F  |  ?   T
//   LineInput/typed "0"             "0"            T   T   F   F  |  ?   T
//   LineInput/untouched             ""             F   F   F   T  |  ?   F
//   LineInput/cleared               ""             F   F   F   T  |  ?   F
//   TextArea/whitespace             "   "          F   T   F   T  |  ?   F
//   TextArea/untouched w/ starter   "Write here."  T   T   F   F  |  ?   ?
//   NumberInput/typed "Bob"         NaN            T   F   F   T  |  F   ?
//   NumberInput/cleared             NaN            T   F   F   T  |  ?   ?
//   NumberInput/typed "0"           0              T   F   T   F  |  ?   T
//   NumberInput/untouched           undefined      F   F   F   T  |  ?   F
//   ChoiceInput/selected False      "false"        T   T   F   F  |  T   T
//   ChoiceInput/untouched           ""             F   F   F   T  |  ?   F
//   CheckboxInput/none checked      []             F   T   F   T  |  ?   ?
//   CheckboxInput/one checked       ["ate_pickle"] T   T   F   F  |  ?   T
//   Done/unchecked                  false          T   F   F   F  |  T   F
//   Done/checked                    true           T   T   F   F  |  T   T
//   NumberLineInput/untouched       undefined      F   F   F   T  |  ?   F
//   NumberLineInput/placed at 0     0              T   F   T   F  |  ?   T
//   SortableInput/before 1st render {arr: []}      T   T   F   F  |  ?   F
//   SortableInput/untouched         {arr:[2,0,1]}  T   T   F   F  |  T   ?
//   SortableInput/moved             {arr:[1,2,0]}  T   T   F   F  |  T   ?
//   TabularMCQ/one row answered     {row1: 0}      T   T   F   F  |  ?   ?
//   TabularMCQ/untouched            {}             F   T   F   T  |  ?   F
//   Freewrite/untouched             ""             F   F   F   T  |  ?   F
//   Freewrite/typed                 "I think..."   T   T   F   F  |  ?   T
//   arithmetic/NaN                  NaN            T   F   F   T  |  F   ?
//   arithmetic/Infinity             Infinity       T   T   F   F  |  ?   ?
//   ref/missing block               undefined      F   F   F   T  |  ?   F
//   literal/0                       0              T   F   T   F  |  ?   ?
//   literal/false                   false          T   F   F   F  |  ?   ?
//   literal/""                      ""             F   F   F   T  |  ?   ?
//
//   fil = isFilled   tru = isTruthy   num = isNumber   mis = isMissing
//   val = isValid (NOT IMPLEMENTED)   ans = isAnswered (NOT IMPLEMENTED)
//
// Everything left of the bar runs. Everything right of the bar is data with
// no implementation behind it: the `?` cells are the ones a value alone
// cannot answer, each carrying a one-phrase reason in CONTEXTUAL below.
//
// The two contextual rows are kept as LIVE DATA rather than commented-out
// code, and exercised by `it.skip` plus one running shape test. Commented-out
// expectations rot silently — they are not type-checked, and nothing notices
// when a column is added without them. As live data, adding a use case to
// CASES without deciding what `isValid`/`isAnswered` should say about it
// fails the shape test, which is the behaviour we want from a breadcrumb.
//
// ── Known bug this table records ────────────────────────────────────────
//
// NumberInput/cleared: `selectors.value` runs parseFloat over the raw string,
// so an emptied box reads as NaN, indistinguishable from "Bob". The expected
// values in the NumberInput/cleared row describe the INTENDED state — an
// unfilled input — not what today's selector makes easy; `isMissing` happens
// to get it right for the wrong reason (NaN is missing), and `isFilled` gets
// it wrong (NaN is a number, so "a value exists"). `isFilled`'s truth table
// is documented here exactly as shipped and is NOT changed by this commit.

import { describe, it, expect } from 'vitest';
import { parse } from './parser';
import { evaluate, createContext, isFilled } from './evaluate';
import { isTruthy, isNumber, isMissing } from './valuePredicates';
import { RESERVED_KEYWORDS } from './keywords';
import { dslFunctions } from './functions';

// ── Use cases ───────────────────────────────────────────────────────────
//
// `value` is what the block actually stores, as seen by an expression —
// i.e. what `@x.value` evaluates to, which for blocks with a `selectors.value`
// is the selector's output, not the raw field.
//
// Worth knowing while reading these: there is no per-field default in this
// codebase. `FieldInfo` has no default slot; "untouched" means the key is
// absent from Redux, and what you read back is whatever `fallback` that
// block's selector passes — chosen per block, never written back to state.
// So "" vs undefined vs [] for an untouched input is a per-block decision,
// not a system-wide one, which is half of why this table has to be a table.

interface UseCase {
  /** `<Block>/<situation>` — the column name in the table above. */
  column: string;
  /** The value an expression sees. */
  value: unknown;
  /** How it got there, and anything surprising about it. */
  note: string;
}

export const CASES: UseCase[] = [
  { column: 'LineInput/typed "1"', value: '1',
    note: 'LineInput stores strings; "1" is never the number 1.' },
  { column: 'LineInput/typed "0"', value: '0',
    note: 'The string "0" — truthy, unlike the number 0 a NumberInput would store.' },
  { column: 'LineInput/untouched', value: '',
    note: 'Nothing is in Redux; the selector supplies a "" fallback. An untouched box and a cleared one are therefore the same value.' },
  { column: 'LineInput/cleared', value: '',
    note: 'Typed then deleted. Identical to untouched — "they tried and gave up" is not recoverable from the value.' },
  { column: 'TextArea/whitespace', value: '   ',
    note: 'Three spaces. isFilled trims, so it says empty; JS truthiness says non-empty. The two disagree, on purpose.' },
  { column: 'TextArea/untouched with starter text', value: 'Write your answer here.',
    note: 'TextArea falls back to its OLX child text when the field is unwritten, so the AUTHOR\'s words arrive as the student\'s value. Filled, non-blank, and nobody has typed anything.' },
  { column: 'NumberInput/typed "Bob"', value: NaN,
    note: 'Raw field holds "Bob"; selectors.value does parseFloat → NaN.' },
  { column: 'NumberInput/cleared', value: NaN,
    note: 'KNOWN BUG: parseFloat("") is NaN too, so a cleared box is indistinguishable from garbage. Expected values below describe the intended state (unfilled).' },
  { column: 'NumberInput/typed "0"', value: 0,
    note: 'A real answer of zero. Falsy, which is why isTruthy must not gate progress.' },
  { column: 'NumberInput/untouched', value: undefined,
    note: 'parseFloat is not reached: the selector returns undefined while the raw field is undefined.' },
  { column: 'ChoiceInput/selected False', value: 'false',
    note: 'A True/False question whose option ids are "true"/"false". The STRING "false" — a deliberate answer, and truthy.' },
  { column: 'ChoiceInput/untouched', value: '',
    note: 'Single-select stores the selected option id; no selection reads back as "" (the selector fallback), not undefined.' },
  { column: 'CheckboxInput/none checked', value: [],
    note: 'Unchecking the last box and never touching the group both give []. isFilled says empty; JS says truthy.' },
  { column: 'CheckboxInput/one checked', value: ['ate_pickle'],
    note: 'Array of selected option ids.' },
  { column: 'Done/unchecked', value: false,
    note: 'A boolean field. false here means "not done" — the absence of an answer, stored as a value.' },
  { column: 'Done/checked', value: true,
    note: 'The student checked the box.' },
  { column: 'NumberLineInput/untouched', value: undefined,
    note: 'The one input that distinguishes untouched from answered: nothing is written until the student commits a position, and the selector maps both null and an absent field to undefined.' },
  { column: 'NumberLineInput/placed at 0', value: 0,
    note: 'Dropped the thumb on zero. Same value as an untouched NumberInput would have if it defaulted to 0 — which is why it does not.' },
  { column: 'SortableInput/before first render', value: { arrangement: [] },
    note: 'The selector fallback, seen by anything that reads the field before the block has rendered once. An empty arrangement inside an object wrapper: isFilled says filled, because the OBJECT has a key.' },
  { column: 'SortableInput/untouched', value: { arrangement: [2, 0, 1] },
    note: 'Indices into the kid list. _SortableInput.tsx dispatches a shuffled default arrangement during its FIRST RENDER, so Redux holds a real answer-shaped value before the student has done anything.' },
  { column: 'SortableInput/moved', value: { arrangement: [1, 2, 0] },
    note: 'Reordered by the student. Structurally identical to the row above — no predicate over the value can tell them apart. That is the point.' },
  { column: 'TabularMCQ/one row answered', value: { row1: 0 },
    note: 'Record<rowId, choiceIndex>. Partial answers are the normal case.' },
  { column: 'TabularMCQ/untouched', value: {},
    note: 'Empty record, not undefined.' },
  { column: 'Freewrite/untouched', value: '',
    note: 'A string field like the other text inputs.' },
  { column: 'Freewrite/typed', value: 'I think the author is wrong.',
    note: 'Ordinary prose.' },
  { column: 'arithmetic/NaN', value: NaN,
    note: 'Not from a block: 0 / 0, or any arithmetic over a missing operand. Arrives in the middle of an expression, where no block can be asked about it.' },
  { column: 'arithmetic/Infinity', value: Infinity,
    note: 'Also not from a block: 1 / 0. A number by typeof, but not one isNumber admits — finite is part of the definition.' },
  { column: 'ref/missing block', value: undefined,
    note: '@nosuchblock.value. The evaluator yields undefined for an unknown ref rather than throwing.' },
  { column: 'literal/0', value: 0,
    note: 'Control: an author-written 0, no block behind it.' },
  { column: 'literal/false', value: false,
    note: 'Control: an author-written false.' },
  { column: 'literal/""', value: '',
    note: 'Control: an author-written empty string.' },
];

type Truth = 'T' | 'F';
/** `?` — a value alone cannot answer this; the reason is in CONTEXTUAL_NOTES. */
type HardTruth = Truth | '?';

const t = (truth: Truth): boolean => truth === 'T';

// ── Implemented predicates ──────────────────────────────────────────────

const IMPLEMENTED: Record<string, { fn: (v: unknown) => boolean; expected: Record<string, Truth> }> = {
  // isFilled EXISTS and is documented here exactly as implemented
  // (evaluate.ts). This commit does not change it. Note the two cells that
  // most often surprise: whitespace is NOT filled (it trims), and NaN IS
  // filled (it is a number, so "a value exists").
  isFilled: {
    fn: isFilled,
    expected: {
      'LineInput/typed "1"': 'T',
      'LineInput/typed "0"': 'T',
      'LineInput/untouched': 'F',
      'LineInput/cleared': 'F',
      'TextArea/whitespace': 'F',
      'TextArea/untouched with starter text': 'T',
      'NumberInput/typed "Bob"': 'T',
      'NumberInput/cleared': 'T',
      'NumberInput/typed "0"': 'T',
      'NumberInput/untouched': 'F',
      'ChoiceInput/selected False': 'T',
      'ChoiceInput/untouched': 'F',
      'CheckboxInput/none checked': 'F',
      'CheckboxInput/one checked': 'T',
      'Done/unchecked': 'T',
      'Done/checked': 'T',
      'NumberLineInput/untouched': 'F',
      'NumberLineInput/placed at 0': 'T',
      'SortableInput/before first render': 'T',
      'SortableInput/untouched': 'T',
      'SortableInput/moved': 'T',
      'TabularMCQ/one row answered': 'T',
      'TabularMCQ/untouched': 'F',
      'Freewrite/untouched': 'F',
      'Freewrite/typed': 'T',
      'arithmetic/NaN': 'T',
      'arithmetic/Infinity': 'T',
      'ref/missing block': 'F',
      'literal/0': 'T',
      'literal/false': 'T',
      'literal/""': 'F',
    },
  },

  // isTruthy — plain JS truthiness. Included so the places it disagrees with
  // every other row are on the record: "0" and "   " and [] are truthy; 0 and
  // NaN are not.
  isTruthy: {
    fn: isTruthy,
    expected: {
      'LineInput/typed "1"': 'T',
      'LineInput/typed "0"': 'T',
      'LineInput/untouched': 'F',
      'LineInput/cleared': 'F',
      'TextArea/whitespace': 'T',
      'TextArea/untouched with starter text': 'T',
      'NumberInput/typed "Bob"': 'F',
      'NumberInput/cleared': 'F',
      'NumberInput/typed "0"': 'F',
      'NumberInput/untouched': 'F',
      'ChoiceInput/selected False': 'T',
      'ChoiceInput/untouched': 'F',
      'CheckboxInput/none checked': 'T',
      'CheckboxInput/one checked': 'T',
      'Done/unchecked': 'F',
      'Done/checked': 'T',
      'NumberLineInput/untouched': 'F',
      'NumberLineInput/placed at 0': 'F',
      'SortableInput/before first render': 'T',
      'SortableInput/untouched': 'T',
      'SortableInput/moved': 'T',
      'TabularMCQ/one row answered': 'T',
      'TabularMCQ/untouched': 'T',
      'Freewrite/untouched': 'F',
      'Freewrite/typed': 'T',
      'arithmetic/NaN': 'F',
      'arithmetic/Infinity': 'T',
      'ref/missing block': 'F',
      'literal/0': 'F',
      'literal/false': 'F',
      'literal/""': 'F',
    },
  },

  // isNumber — typeof number AND finite. No string is a number here, however
  // numeric it looks; the language does not coerce.
  isNumber: {
    fn: isNumber,
    expected: {
      'LineInput/typed "1"': 'F',
      'LineInput/typed "0"': 'F',
      'LineInput/untouched': 'F',
      'LineInput/cleared': 'F',
      'TextArea/whitespace': 'F',
      'TextArea/untouched with starter text': 'F',
      'NumberInput/typed "Bob"': 'F',
      'NumberInput/cleared': 'F',
      'NumberInput/typed "0"': 'T',
      'NumberInput/untouched': 'F',
      'ChoiceInput/selected False': 'F',
      'ChoiceInput/untouched': 'F',
      'CheckboxInput/none checked': 'F',
      'CheckboxInput/one checked': 'F',
      'Done/unchecked': 'F',
      'Done/checked': 'F',
      'NumberLineInput/untouched': 'F',
      'NumberLineInput/placed at 0': 'T',
      'SortableInput/before first render': 'F',
      'SortableInput/untouched': 'F',
      'SortableInput/moved': 'F',
      'TabularMCQ/one row answered': 'F',
      'TabularMCQ/untouched': 'F',
      'Freewrite/untouched': 'F',
      'Freewrite/typed': 'F',
      'arithmetic/NaN': 'F',
      'arithmetic/Infinity': 'F',
      'ref/missing block': 'F',
      'literal/0': 'T',
      'literal/false': 'F',
      'literal/""': 'F',
    },
  },

  // isMissing — the one the aggregates need. isFilled's blanks, plus NaN.
  // It differs from !isFilled in exactly two columns, both NaN, and from
  // !isTruthy in six.
  isMissing: {
    fn: isMissing,
    expected: {
      'LineInput/typed "1"': 'F',
      'LineInput/typed "0"': 'F',
      'LineInput/untouched': 'T',
      'LineInput/cleared': 'T',
      'TextArea/whitespace': 'T',
      'TextArea/untouched with starter text': 'F',
      'NumberInput/typed "Bob"': 'T',
      'NumberInput/cleared': 'T',
      'NumberInput/typed "0"': 'F',
      'NumberInput/untouched': 'T',
      'ChoiceInput/selected False': 'F',
      'ChoiceInput/untouched': 'T',
      'CheckboxInput/none checked': 'T',
      'CheckboxInput/one checked': 'F',
      'Done/unchecked': 'F',
      'Done/checked': 'F',
      'NumberLineInput/untouched': 'T',
      'NumberLineInput/placed at 0': 'F',
      'SortableInput/before first render': 'F',
      'SortableInput/untouched': 'F',
      'SortableInput/moved': 'F',
      'TabularMCQ/one row answered': 'F',
      'TabularMCQ/untouched': 'T',
      'Freewrite/untouched': 'T',
      'Freewrite/typed': 'F',
      'arithmetic/NaN': 'T',
      'arithmetic/Infinity': 'F',
      'ref/missing block': 'T',
      'literal/0': 'F',
      'literal/false': 'F',
      'literal/""': 'T',
    },
  },
};

// ── NOT IMPLEMENTED: the contextual predicates ──────────────────────────
//
// These two are what the table is a breadcrumb FOR. Neither can be written as
// a function of the stored value, so neither is registered as a built-in —
// but both names are reserved in keywords.ts so no block can claim them
// before we get here.
//
// isValid   — "is this a legal value for this block, as configured?"
//             Needs: the block's own judgment. Its valueSchema (many inputs
//             declare none — see notes/value-typing-audit.md §2), its
//             configuration (min/max on a NumberLineInput, required, a
//             LineInput's pattern, TabularMCQ's row set), and for several
//             blocks whether blank counts as legal at all.
//
// isAnswered — "did the student give an answer?"
//             Needs: state introspection the value does not carry — whether
//             the field was ever WRITTEN, as distinct from holding its
//             default. Today a Redux field that has never been touched and
//             one written back to its default are the same. The obvious
//             shapes: a per-field dirty/touched bit recorded on first write,
//             or a block-supplied `isAnswered(value, config)` hook, or (for
//             the Sortable case specifically) storing null until first
//             interaction the way NumberLineInput already does. Note that
//             the third fixes Sortable without helping Done, and the first
//             fixes Done ("false, and never touched") without helping the
//             student who checked and unchecked.

const CONTEXTUAL: Record<string, Record<string, HardTruth>> = {
  isValid: {
    'LineInput/typed "1"': '?',           // legal unless a pattern says otherwise
    'LineInput/typed "0"': '?',           // ditto
    'LineInput/untouched': '?',           // is blank legal? depends on `required`
    'LineInput/cleared': '?',             // same question
    'TextArea/whitespace': '?',           // blank-ish; depends on `required`
    'TextArea/untouched with starter text': '?',   // depends on `required` / any length rule
    'NumberInput/typed "Bob"': 'F',       // not a number in a number box
    'NumberInput/cleared': '?',           // blank may be legal if not required
    'NumberInput/typed "0"': '?',         // legal unless out of a configured range
    'NumberInput/untouched': '?',         // depends on `required`
    'ChoiceInput/selected False': 'T',    // a declared option id
    'ChoiceInput/untouched': '?',         // depends on `required`
    'CheckboxInput/none checked': '?',    // depends on any minimum-selections rule
    'CheckboxInput/one checked': '?',     // legal unless a min/max selection rule
    'Done/unchecked': 'T',                // a boolean is always a legal Done value
    'Done/checked': 'T',                  // likewise
    'NumberLineInput/untouched': '?',     // depends on `required`
    'NumberLineInput/placed at 0': '?',   // depends whether 0 is inside [min, max]
    'SortableInput/before first render': '?',   // an empty arrangement is not a permutation of the items
    'SortableInput/untouched': 'T',       // a permutation of the items is well-formed
    'SortableInput/moved': 'T',           // likewise
    'TabularMCQ/one row answered': '?',   // depends whether every row must be answered
    'TabularMCQ/untouched': '?',          // same question
    'Freewrite/untouched': '?',           // depends on `required` / any length rule
    'Freewrite/typed': '?',               // depends on any length rule
    'arithmetic/NaN': 'F',                // never a legal value anywhere
    'arithmetic/Infinity': '?',           // no block to ask; legal in an expression
    'ref/missing block': '?',             // no block to ask
    'literal/0': '?',                     // no block to ask
    'literal/false': '?',                 // no block to ask
    'literal/""': '?',                    // no block to ask
  },

  isAnswered: {
    'LineInput/typed "1"': 'T',
    'LineInput/typed "0"': 'T',
    'LineInput/untouched': 'F',
    'LineInput/cleared': 'F',             // typed then deleted — touched, but no answer
    'TextArea/whitespace': 'F',           // spaces are not an answer
    'TextArea/untouched with starter text': '?',   // the author's own starter text; identical to a student who retyped it
    'NumberInput/typed "Bob"': '?',       // NaN conflates typed-garbage with cleared
    'NumberInput/cleared': '?',           // same NaN as the row above
    'NumberInput/typed "0"': 'T',
    'NumberInput/untouched': 'F',
    'ChoiceInput/selected False': 'T',    // "false" is a chosen option, not an absence
    'ChoiceInput/untouched': 'F',
    'CheckboxInput/none checked': '?',    // never touched, or deliberately "none of these"
    'CheckboxInput/one checked': 'T',
    'Done/unchecked': 'F',                // false here is the absence of an answer
    'Done/checked': 'T',
    'NumberLineInput/untouched': 'F',
    'NumberLineInput/placed at 0': 'T',
    'SortableInput/before first render': 'F',   // nothing has rendered, let alone been dragged
    'SortableInput/untouched': '?',       // intended F; the value cannot tell
    'SortableInput/moved': '?',           // intended T; the value cannot tell
    'TabularMCQ/one row answered': '?',   // partial: answered, or not yet?
    'TabularMCQ/untouched': 'F',
    'Freewrite/untouched': 'F',
    'Freewrite/typed': 'T',
    'arithmetic/NaN': '?',                // no student value behind it
    'arithmetic/Infinity': '?',           // no student value behind it
    'ref/missing block': 'F',             // there is no block, so nobody answered
    'literal/0': '?',                     // not a student value at all
    'literal/false': '?',                 // not a student value at all
    'literal/""': '?',                    // not a student value at all
  },
};

// ════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════

describe('value-state predicate table', () => {
  it('covers every use case exactly once', () => {
    const columns = CASES.map(c => c.column);
    expect(new Set(columns).size).toBe(columns.length);
    expect(CASES.every(c => c.note.length > 0)).toBe(true);
  });

  for (const [name, { fn, expected }] of Object.entries(IMPLEMENTED)) {
    describe(name, () => {
      it('has an expectation for every use case, and no stale ones', () => {
        expect(Object.keys(expected).sort()).toEqual(CASES.map(c => c.column).sort());
      });

      it.each(CASES)(`${name}($column) → $note`, ({ column, value }) => {
        expect(fn(value)).toBe(t(expected[column]));
      });
    });
  }
});

describe('the contextual predicates (NOT IMPLEMENTED)', () => {
  // The breadcrumb's teeth: a new use case cannot be added without deciding
  // what isValid and isAnswered should say about it, even though neither
  // exists yet. If you cannot decide, '?' with a reason is a decision.
  it.each(Object.keys(CONTEXTUAL))('%s has an expectation for every use case', (name) => {
    expect(Object.keys(CONTEXTUAL[name]).sort()).toEqual(CASES.map(c => c.column).sort());
  });

  it('reserves both names so no block can claim them first', () => {
    expect(RESERVED_KEYWORDS.has('isValid')).toBe(true);
    expect(RESERVED_KEYWORDS.has('isAnswered')).toBe(true);
  });

  it('does not register either as a built-in', () => {
    expect('isValid' in dslFunctions).toBe(false);
    expect('isAnswered' in dslFunctions).toBe(false);
  });

  // Turn these on when the predicate exists: drop the `.skip`, import the
  // implementation, and every '?' cell has to become a T or an F first.
  it.skip('isValid matches the table', () => {
    // const fn = isValid;
    // for (const { column, value } of CASES) {
    //   expect(fn(value)).toBe(t(CONTEXTUAL.isValid[column] as Truth));
    // }
  });

  it.skip('isAnswered matches the table', () => {
    // const fn = isAnswered;
    // for (const { column, value } of CASES) {
    //   expect(fn(value)).toBe(t(CONTEXTUAL.isAnswered[column] as Truth));
    // }
  });
});

// ── The predicates are reachable from expressions ───────────────────────

describe('registered as built-ins', () => {
  const ev = (expr: string, data: Record<string, unknown> = {}) =>
    evaluate(parse(expr), createContext(data));

  it.each(['isFilled', 'isTruthy', 'isNumber', 'isMissing'])('%s is a DSL function', (name) => {
    expect(typeof dslFunctions[name]).toBe('function');
    expect(RESERVED_KEYWORDS.has(name)).toBe(true);
  });

  it('evaluates over a sigil ref', () => {
    const data = { componentState: { n: { value: 0 }, essay: { value: '   ' } } };
    expect(ev('isMissing(@n.value)', data)).toBe(false);
    expect(ev('isNumber(@n.value)', data)).toBe(true);
    expect(ev('isTruthy(@n.value)', data)).toBe(false);
    expect(ev('isMissing(@essay.value)', data)).toBe(true);
  });

  it('evaluates over a missing ref without throwing', () => {
    expect(ev('isMissing(@nosuchblock.value)')).toBe(true);
    expect(ev('isFilled(@nosuchblock.value)')).toBe(false);
    expect(ev('isNumber(@nosuchblock.value)')).toBe(false);
  });

  it('sees NaN produced by arithmetic inside the expression', () => {
    // The `arithmetic/NaN` column, end to end rather than as a fixture.
    expect(ev('isMissing(0 / 0)')).toBe(true);
    expect(ev('isFilled(0 / 0)')).toBe(true);   // the disagreement, on the record
    expect(ev('isNumber(1 / 0)')).toBe(false);  // Infinity is not a number here
  });

  it('gates the way content gates', () => {
    const data = { componentState: { q: { value: '' }, n: { value: 0 } } };
    expect(ev('!isMissing(@q.value) && !isMissing(@n.value)', data)).toBe(false);
    expect(ev('isMissing(@n.value) ? 0 : @n.value', data)).toBe(0);
  });
});
