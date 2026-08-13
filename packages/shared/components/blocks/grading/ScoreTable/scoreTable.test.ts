// Turning authored sheets and published verdicts into a score table.
import { describe, it, expect } from 'vitest';
import { parseItems, declaredSheet, scoreOf } from './_ScoreTable';

const ATTRS = { slots: 'a:A:met/absent@3|b:B:met/absent@2' };
const published = (verdicts: Record<string, string>) => JSON.stringify({
  slots: [
    { key: 'a', label: 'A', options: ['met', 'absent'], gates: false, pts: 3 },
    { key: 'b', label: 'B', options: ['met', 'absent'], gates: false, pts: 2 },
  ],
  verdicts: Object.fromEntries(Object.entries(verdicts).map(([k, v]) => [k, { verdict: v }])),
});

describe('parseItems', () => {
  it('reads id:label pairs and keeps a colon inside the label', () => {
    expect(parseItems('x_llm:1. Defining|t1:First type: Positive Reinforcement')).toEqual([
      { id: 'x_llm', label: '1. Defining' },
      { id: 't1', label: 'First type: Positive Reinforcement' },
    ]);
  });

  it('ignores empties and falls back to the id', () => {
    expect(parseItems('  |  |solo')).toEqual([{ id: 'solo', label: 'solo' }]);
    expect(parseItems('')).toEqual([]);
  });
});

// The maximum comes from what the author DECLARED, so it is known before the
// student has done anything. Deriving it from the published sheet made the
// denominator grow as they worked.
describe('declaredSheet', () => {
  it('sums the slot points', () => {
    expect(declaredSheet(ATTRS)!.max).toBe(5);
  });

  it('prefers an explicit max over the sum', () => {
    expect(declaredSheet({ ...ATTRS, max: '10' })!.max).toBe(10);
    expect(declaredSheet({ ...ATTRS, max: 10 })!.max).toBe(10);
  });

  it('is null for a block that declares no sheet or no points', () => {
    expect(declaredSheet(undefined)).toBeNull();
    expect(declaredSheet({})).toBeNull();
    expect(declaredSheet({ slots: 'a:A:met/absent' })).toBeNull();   // unscored
  });

  it('carries the primitives through, so scoring matches the grader', () => {
    const d = declaredSheet({ ...ATTRS, counts: 'g:a,b', onlyif: 'a:b' })!;
    expect(d.counts).toHaveLength(1);
    expect(d.onlyif).toHaveLength(1);
  });
});

describe('scoreOf', () => {
  const d = declaredSheet(ATTRS);

  it('reports points earned', () => {
    expect(scoreOf(published({ a: 'met', b: 'met' }), d)).toBe(5);
    expect(scoreOf(published({ a: 'met', b: 'absent' }), d)).toBe(3);
    expect(scoreOf(published({ a: 'absent', b: 'absent' }), d)).toBe(0);
  });

  // Null, not zero: an unanswered item shows a dash while still contributing
  // its declared maximum to the total available.
  it('is null when nothing has been published yet', () => {
    for (const raw of ['', null, 'not json', '{}']) {
      expect(scoreOf(raw, d)).toBeNull();
    }
  });

  it('is null when the row is not a graded item at all', () => {
    expect(scoreOf(published({ a: 'met' }), null)).toBeNull();
  });
});
