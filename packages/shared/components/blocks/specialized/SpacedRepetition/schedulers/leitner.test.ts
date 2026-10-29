// packages/shared/components/blocks/specialized/SpacedRepetition/schedulers/leitner.test.ts
import { describe, it, expect } from 'vitest';
import { leitner, createLeitner } from './leitner';

const DAY = 24 * 60 * 60 * 1000;

describe('leitner', () => {
  const s = leitner({ boxes: 3, baseInterval: DAY });

  it('starts new cards in box 1, due immediately', () => {
    const card = s.initCard(1000);
    expect(card).toEqual({ box: 1, dueAt: 1000 });
    expect(s.isDue(card, 1000)).toBe(true);
    expect(s.isDue(card, 999)).toBe(false);
  });

  it('moves up on correct, doubling the interval, and caps at the top box', () => {
    let card = s.initCard(0);
    const seen = [];
    for (const now of [0, 10 * DAY, 20 * DAY, 30 * DAY]) {
      card = s.record(card, 'correct', now);
      seen.push([card.box, (s.dueAt(card) - now) / DAY]);
    }
    expect(seen).toEqual([[2, 2], [3, 4], [3, 4], [3, 4]]);
  });

  it('returns to box 1 on incorrect or gaveUp', () => {
    const card = s.record({ box: 3, dueAt: 0 }, 'incorrect', 5 * DAY);
    expect(card).toEqual({ box: 1, dueAt: 6 * DAY });
    expect(s.record({ box: 3, dueAt: 0 }, 'gaveUp', 5 * DAY)).toEqual(card);
    expect(s.priority(card)).toBe(1);
  });

  it('clamps cards stored under a larger deck', () => {
    expect(s.priority({ box: 7, dueAt: 0 })).toBe(3);
    expect(s.record({ box: 7, dueAt: 0 }, 'correct', 0).box).toBe(3);
  });

  it('takes baseInterval in seconds from attributes', () => {
    const fromAttrs = createLeitner({ boxes: 5, baseInterval: 60 });
    expect(fromAttrs.record(fromAttrs.initCard(0), 'incorrect', 0)).toEqual({ box: 1, dueAt: 60_000 });
  });

  it('rejects nonsense configuration', () => {
    expect(() => leitner({ boxes: 0, baseInterval: DAY })).toThrow(/boxes/);
    expect(() => leitner({ boxes: 5, baseInterval: 0 })).toThrow(/baseInterval/);
  });
});
