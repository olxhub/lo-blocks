// Cover groups: the grader does the pairing, not the prompt.
//
// The rubric case these exist for is Q6 of the behavior-modification handouts:
// "change each of your two antecedents (from 4a)". Whether the student addressed
// both does not depend on which box they used, so asking the model "does this box
// match 4a?" makes it reason about its own other answer. Here the model only
// reports identity — first / second / neither — and the arithmetic is code.

import { describe, it, expect } from 'vitest';
import {
  parseCover,
  parseSlots,
  satisfiedMap,
  scoreSlotSheet,
  failedGate,
} from './slotSheet';

const SPEC =
  'state_a1:First antecedent:first/second/neither@2|' +
  'state_a2:Second antecedent:first/second/neither@2';
const COVER = 'state_a1,state_a2:first,second';
const slots = parseSlots(SPEC);
const cover = parseCover(COVER);
const v = (a: string, b: string) => ({ state_a1: { verdict: a }, state_a2: { verdict: b } });

describe('parseCover', () => {
  it('reads groups and labels', () => {
    expect(parseCover('a,b:first,second|c,d:x,y')).toEqual([
      { keys: ['a', 'b'], labels: ['first', 'second'] },
      { keys: ['c', 'd'], labels: ['x', 'y'] },
    ]);
  });

  it('is empty for an absent or malformed attribute', () => {
    expect(parseCover(undefined)).toEqual([]);
    expect(parseCover('')).toEqual([]);
    expect(parseCover('nolabels')).toEqual([]);
    expect(parseCover(':first')).toEqual([]);
  });
});

describe('satisfiedMap with a cover group', () => {
  it('credits both when the pair covers both labels IN ORDER', () => {
    expect(satisfiedMap(slots, v('first', 'second'), cover))
      .toEqual({ state_a1: true, state_a2: true });
  });

  it('credits both when the pair covers both labels REVERSED — the point of this', () => {
    expect(satisfiedMap(slots, v('second', 'first'), cover))
      .toEqual({ state_a1: true, state_a2: true });
  });

  it('credits only the first claimant when both name the same label', () => {
    expect(satisfiedMap(slots, v('first', 'first'), cover))
      .toEqual({ state_a1: true, state_a2: false });
    expect(satisfiedMap(slots, v('second', 'second'), cover))
      .toEqual({ state_a1: true, state_a2: false });
  });

  it('refuses a label outside the group', () => {
    expect(satisfiedMap(slots, v('neither', 'second'), cover))
      .toEqual({ state_a1: false, state_a2: true });
    expect(satisfiedMap(slots, v('neither', 'neither'), cover))
      .toEqual({ state_a1: false, state_a2: false });
  });

  it('refuses a missing verdict', () => {
    expect(satisfiedMap(slots, { state_a1: { verdict: 'first' } }, cover))
      .toEqual({ state_a1: true, state_a2: false });
  });

  it('leaves checks outside any cover group on the first-verdict rule', () => {
    const mixed = parseSlots('a:A:met/absent@1|b:B:first/second/neither@1');
    const got = satisfiedMap(
      mixed,
      { a: { verdict: 'met' }, b: { verdict: 'second' } },
      parseCover('b:first,second'),
    );
    expect(got).toEqual({ a: true, b: true });
  });
});

describe('scoreSlotSheet with a cover group', () => {
  const score = (a: string, b: string) =>
    scoreSlotSheet(slots, v(a, b), undefined, cover);

  it('is full marks either way round', () => {
    expect(score('first', 'second')).toEqual({ score: 4, max: 4, failed: [] });
    expect(score('second', 'first')).toEqual({ score: 4, max: 4, failed: [] });
  });

  it('charges one slot for naming the same thing twice', () => {
    expect(score('first', 'first')).toEqual({ score: 2, max: 4, failed: ['state_a2'] });
  });

  it('charges both when neither is named', () => {
    expect(score('neither', 'neither'))
      .toEqual({ score: 0, max: 4, failed: ['state_a1', 'state_a2'] });
  });

  it('scores identically to the old behaviour when no cover is declared', () => {
    // Without a group, only the FIRST verdict counts as satisfied — so `second`
    // would fail. This is what made the ordering leak into the score.
    expect(scoreSlotSheet(slots, v('first', 'second'), undefined, []))
      .toEqual({ score: 2, max: 4, failed: ['state_a2'] });
  });
});

describe('gates inside a cover group', () => {
  const gated = parseSlots('!g1:G1:first/second/neither|!g2:G2:first/second/neither');
  const gcover = parseCover('g1,g2:first,second');

  it('does not fire when the pair covers both labels reversed', () => {
    expect(failedGate(gated, v2('second', 'first'), gcover)).toBeNull();
  });

  it('fires on the double-claimed check', () => {
    expect(failedGate(gated, v2('first', 'first'), gcover)?.key).toBe('g2');
  });

  function v2(a: string, b: string) {
    return { g1: { verdict: a }, g2: { verdict: b } };
  }
});
