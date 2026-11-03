// packages/shared/lib/stateLanguage/aggregates.test.ts
//
// The semantics contract for sum / countFilled / average.
//
// These run THROUGH THE EXPRESSION LANGUAGE, not against the exported
// functions directly, because the contract is what an author writes in an
// attribute — a literal full of refs, some of them unanswered. The fixture
// below is the per-block table from the design note: what each kind of block
// actually stores when the student hasn't answered it.
//
// Read aggregates.ts before changing an expectation here: a change to any of
// these lines re-scores every archived response with no parse error
// anywhere.

import { describe, it, expect } from 'vitest';
import { parse } from './parser';
import { evaluate, createContext } from './evaluate';
import { sum, countFilled, average } from './aggregates';

// Per-block fixture: unanswered values differ by block, and that is the
// whole reason `isMissing` exists rather than a single blank sentinel.
const ctx = () => createContext({
  componentState: {
    a: { value: 'agree', code: 1 },            // ChoiceInput, answered
    blank: { value: '' },                      // ChoiceInput, unanswered
    none: { value: [] },                       // CheckboxInput, unanswered
    empty: { value: {} },                      // TabularMCQ, unanswered
    spaces: { value: '   ' },                  // whitespace-only TextArea
    n: { value: NaN },                         // cleared NumberInput
    slider: { value: undefined },              // NumberLineInput, unanswered
    zero: { value: 0 },                        // NumberInput answer of zero
    no: { value: false },                      // True/False answer of false
    // @gone is deliberately absent from the bucket table entirely.
  },
});

const ev = (expr: string) => evaluate(parse(expr), ctx());

describe('sum', () => {
  it('totals the numbers', () => {
    expect(ev('sum([1, 2, 3])')).toBe(6);
    expect(ev('sum([1.5, 2.5])')).toBe(4);
    // NOTE: unary minus is not in the language (it was dropped with `recode`
    // — codes live on the item as code="-1", parsed outside the expression
    // language). A negative literal inside an expression is written as a
    // subtraction. `[-1, 1]` is a parse error.
    expect(ev('sum([0 - 1, 1])')).toBe(0);
    expect(() => parse('sum([-1, 1])')).toThrow();
  });

  it('skips missing elements, in every shape a block produces', () => {
    expect(ev('sum([1, @blank.value, @gone.value, @n.value, 2])')).toBe(3);
    expect(ev('sum([1, @none.value, @empty.value, @spaces.value, 2])')).toBe(3);
    expect(ev('sum([@slider.value, 5])')).toBe(5);
  });

  it('counts a zero answer as a value, not a blank', () => {
    expect(ev('sum([@zero.value, 5])')).toBe(5);
    expect(ev('sum([@zero.value])')).toBe(0);
  });

  it('is 0 for an empty or all-missing list (the identity)', () => {
    // Not undefined: this is what makes a shrinkage formula land on its
    // midpoint rather than on NaN when nothing is answered yet.
    expect(ev('sum([])')).toBe(0);
    expect(ev('sum([@blank.value, @gone.value])')).toBe(0);
  });

  it('throws on a non-missing non-number (PROVISIONAL — fork 1)', () => {
    expect(() => ev('sum(["1", 2])')).toThrow(TypeError);
    expect(() => ev('sum(["1", 2])')).toThrow(/does not coerce/);
    expect(() => ev('sum([true, 1])')).toThrow(TypeError);
    expect(() => ev('sum([@a.value])')).toThrow(TypeError);   // 'agree'
    expect(() => ev('sum([@no.value])')).toThrow(TypeError);  // false is not a blank
  });

  it('throws on a non-list argument (one list, not varargs)', () => {
    expect(() => ev('sum(3)')).toThrow(/expects a list, got number 3/);
    expect(() => ev('sum(@gone.value)')).toThrow(/expects a list, got undefined/);
    expect(() => ev('sum(@a.value)')).toThrow(/expects a list, got string "agree"/);
  });

  it('reads codes off answered items — the motivating shape', () => {
    expect(ev('sum([@a.code, @gone.code])')).toBe(1);
  });

  it('lets Infinity through as a number (§2; see aggregates.ts)', () => {
    expect(sum([1e308, 1e308])).toBe(Infinity);
  });
});

describe('countFilled', () => {
  it('counts non-missing elements of any type', () => {
    // 0 and false are VALUES. A student who answered "0" answered.
    expect(ev('countFilled([@a.value, @blank.value, @gone.value, 0, false])')).toBe(3);
  });

  it('does not count isFilled\'s blanks', () => {
    expect(ev('countFilled(["  ", [], {}])')).toBe(0);
    expect(ev('countFilled([@blank.value, @none.value, @empty.value, @spaces.value])')).toBe(0);
    expect(ev('countFilled([@n.value, @slider.value])')).toBe(0);
  });

  it('is 0 for an empty list', () => {
    expect(ev('countFilled([])')).toBe(0);
  });

  it('disagrees with .length by exactly the number of blanks', () => {
    // .length is COUNT(*) — slots. countFilled is COUNT(col) — values.
    // This is the likeliest author bug in this kind of content, so it is
    // pinned here rather than left to be discovered.
    expect(ev('[1, @blank.value].length')).toBe(2);
    expect(ev('countFilled([1, @blank.value])')).toBe(1);
  });

  it('is for ACROSS inputs; one checkbox still uses .length', () => {
    // "Answered at least 3 of these 5" — an unanswered checkbox is one
    // blank item.
    expect(ev('countFilled([@a.value, @none.value, @zero.value]) >= 2')).toBe(true);
    // "Pick exactly 2" on ONE CheckboxInput is .length, not countFilled.
    const c = createContext({ componentState: { cb: { value: ['x', 'y'] } } });
    expect(evaluate(parse('@cb.value.length === 2'), c)).toBe(true);
    expect(evaluate(parse('countFilled(@cb.value)'), c)).toBe(2);
  });

  it('throws on a non-list argument', () => {
    expect(() => ev('countFilled(3)')).toThrow(/expects a list/);
    expect(() => ev('countFilled(@gone.value)')).toThrow(/expects a list/);
  });
});

describe('average', () => {
  it('means the non-missing elements', () => {
    expect(ev('average([1, 2, 3])')).toBe(2);
    expect(ev('average([1, 2, 3, @blank.value])')).toBe(2);
    expect(ev('average([@zero.value, 2])')).toBe(1);
  });

  it('is undefined — absent — when there is nothing to average', () => {
    // Not NaN and not 0: `undefined` is this language's absence, and a
    // NumberLineInput initial= reading undefined falls back to its midpoint.
    expect(ev('average([])')).toBeUndefined();
    expect(ev('average([@blank.value, @gone.value])')).toBeUndefined();
  });

  it('throws on a non-missing non-number', () => {
    expect(() => ev('average([@a.value, 1])')).toThrow(TypeError);
    expect(() => ev('average(["1"])')).toThrow(TypeError);
  });

  it('throws on a non-list argument', () => {
    expect(() => ev('average(3)')).toThrow(/expects a list/);
  });

  describe('weights (PROVISIONAL — fork 2: option, not positional)', () => {
    it('weights the mean', () => {
      expect(ev('average([1, 2, 3], {weights: [1, 1, 2]})')).toBe(2.25);
      expect(ev('average([1, 2], {weights: [1, 1]})')).toBe(1.5);
    });

    it('pair-drops when the VALUE is missing', () => {
      expect(ev('average([1, @blank.value, 3], {weights: [1, 5, 1]})')).toBe(2);
    });

    it('pair-drops when the WEIGHT is missing', () => {
      expect(ev('average([1, 2, 3], {weights: [1, @gone.value, 1]})')).toBe(2);
    });

    it('throws on a length mismatch', () => {
      expect(() => ev('average([1, 2], {weights: [1, 5, 1]})')).toThrow(TypeError);
      expect(() => ev('average([1, 2], {weights: [1, 5, 1]})')).toThrow(/weights has 3 entries/);
    });

    it('is undefined when the total weight is zero', () => {
      expect(ev('average([1, 2], {weights: [0, 0]})')).toBeUndefined();
      // By cancellation, same rule — no special case. (Written as a
      // subtraction: the language has no unary minus.)
      expect(ev('average([1, 2], {weights: [1, 0 - 1]})')).toBeUndefined();
      // And when every pair is dropped.
      expect(ev('average([@blank.value], {weights: [1]})')).toBeUndefined();
    });

    it('throws on an unknown option — typos fail loudly', () => {
      expect(() => ev('average([1, 2], {weight: [1, 1]})')).toThrow(/unknown option "weight"/);
      expect(() => ev('average([1, 2], {weigths: [1, 1]})')).toThrow(TypeError);
    });

    it('throws when weights is not a list, or options is not an object', () => {
      expect(() => ev('average([1, 2], {weights: 3})')).toThrow(/weights must be a list/);
      expect(() => ev('average([1, 2], [1, 1])')).toThrow(/expects an options object/);
      expect(() => ev('average([1, 2], 3)')).toThrow(/expects an options object/);
    });

    it('throws on a non-numeric weight', () => {
      expect(() => ev('average([1, 2], {weights: [1, "2"]})')).toThrow(TypeError);
    });
  });
});

describe('aggregates over refs re-evaluate (the reason for the literal)', () => {
  it('reads whatever the buckets hold at evaluation time', () => {
    const scale = 'average([@s09.code, @s19.code, @s06.code])';
    const at = (state: Record<string, any>) =>
      evaluate(parse(scale), createContext({ componentState: state }));

    // Nothing answered → absent, so the display falls back.
    expect(at({})).toBeUndefined();
    // One answered → that answer.
    expect(at({ s09: { code: 2 } })).toBe(2);
    // Two answered → their mean; the unanswered item does not drag it to 0.
    expect(at({ s09: { code: 2 }, s19: { code: -1 } })).toBe(0.5);
    expect(at({ s09: { code: 2 }, s19: { code: -1 }, s06: { code: 2 } })).toBe(1);
  });
});

describe('direct calls match the expression path', () => {
  // The registry hands these out as ordinary functions; nothing in the
  // evaluator adjusts their behaviour.
  it('sum / countFilled / average', () => {
    expect(sum([1, null, 2])).toBe(2 + 1);
    expect(countFilled([1, null, 2])).toBe(2);
    expect(average([1, null, 3])).toBe(2);
    expect(average([])).toBeUndefined();
    expect(() => sum('nope' as unknown)).toThrow(TypeError);
  });
});
