// packages/shared/components/blocks/specialized/SpacedRepetition/deck.test.ts
import { describe, it, expect } from 'vitest';
import { leitner } from './schedulers/leitner';
import { reconcileCards, selectNext, selectSoonest, countDue, recordReview } from './deck';
import type { Cards } from './deck';

const s = leitner({ boxes: 5, baseInterval: 100 });
const card = (box: number, dueAt: number, reps = 0) => ({ algorithm: 'leitner', reps, state: { box, dueAt } });

describe('reconcileCards', () => {
  it('initializes new cards, keeps known ones, drops removed ones', () => {
    const stored: Cards = { a: card(3, 50, 4), gone: card(1, 0) };
    expect(reconcileCards(stored, ['a', 'b'], s, 10)).toEqual({ cards: { a: card(3, 50, 4), b: card(1, 10) }, changed: true });
    expect(reconcileCards(null, ['a'], s, 10)).toEqual({ cards: { a: card(1, 10) }, changed: true });
  });

  it('reports no change when already in sync', () => {
    const stored: Cards = { a: card(2, 0) };
    expect(reconcileCards(stored, ['a'], s, 10)).toEqual({ cards: stored, changed: false });
  });

  it('re-initializes cards stored by another algorithm, keeping review counts', () => {
    const stored: Cards = { a: { algorithm: 'sm2', reps: 7, state: { ease: 2.5 } } };
    expect(reconcileCards(stored, ['a'], s, 10).cards).toEqual({ a: card(1, 10, 7) });
  });
});

describe('selection', () => {
  // keys in deck order; c and d tie on box and dueAt
  const keys = ['a', 'b', 'c', 'd', 'e'];
  const cards: Cards = {
    a: card(3, 0),
    b: card(2, 40),
    c: card(2, 30),
    d: card(2, 30),
    e: card(1, 500),
  };

  it('prefers the lowest box among due cards, then earliest due, then deck order', () => {
    expect(selectNext(cards, keys, s, 100)).toBe('c');
    expect(selectNext(cards, ['d', 'c'], s, 100)).toBe('d');
    expect(selectNext(cards, keys, s, 1000)).toBe('e');
    expect(countDue(cards, keys, s, 100)).toBe(4);
  });

  it('finds nothing due before the earliest dueAt, but study-ahead finds the soonest card', () => {
    const later: Cards = { x: card(1, 900), y: card(4, 200) };
    expect(selectNext(later, ['x', 'y'], s, 100)).toBeNull();
    expect(selectSoonest(later, ['x', 'y'], s)).toBe('y');
  });

  it('ignores keys with no stored schedule', () => {
    expect(selectNext({}, ['a'], s, 0)).toBeNull();
    expect(selectSoonest({}, ['a'], s)).toBeNull();
  });
});

describe('recordReview', () => {
  it('advances one card and counts the review', () => {
    const before: Cards = { a: card(1, 0), b: card(1, 0) };
    const after = recordReview(before, 'a', s, 'correct', 1000);
    expect(after).toEqual({ a: card(2, 1200, 1), b: card(1, 0) });
    expect(before.a.reps).toBe(0);
    expect(() => recordReview(before, 'nope', s, 'correct', 0)).toThrow(/nope/);
  });
});
