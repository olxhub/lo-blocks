// packages/shared/components/blocks/specialized/SpacedRepetition/schedulers/leitner.ts
//
// Leitner system (Sebastian Leitner, 1972). Cards live in boxes 1..N.
// Correct moves a card up one box (capped at N); incorrect sends it back
// to box 1. A card in box k is due baseInterval * 2^(k-1) after review.
// New cards start in box 1 and are due immediately.

import type { Scheduler, SchedulerFactory } from './types';

export interface LeitnerCard {
  box: number;
  dueAt: number;
}

export function leitner({ boxes, baseInterval }: { boxes: number; baseInterval: number }): Scheduler<LeitnerCard> {
  if (!Number.isInteger(boxes) || boxes < 1) throw new Error(`leitner: boxes must be a positive integer, got ${boxes}`);
  if (!(baseInterval > 0)) throw new Error(`leitner: baseInterval must be positive, got ${baseInterval}`);

  // A deck re-authored with fewer boxes keeps working.
  const clamp = (box: number) => Math.min(Math.max(box, 1), boxes);
  const interval = (box: number) => baseInterval * 2 ** (clamp(box) - 1);

  return {
    name: 'leitner',
    initCard: (now) => ({ box: 1, dueAt: now }),
    isDue: (card, now) => card.dueAt <= now,
    dueAt: (card) => card.dueAt,
    priority: (card) => clamp(card.box),
    record: (card, result, now) => {
      const box = result === 'correct' ? clamp(card.box + 1) : 1;
      return { box, dueAt: now + interval(box) };
    },
  };
}

/** Attribute adapter: `baseInterval` arrives in seconds (z_olx_duration). */
export const createLeitner: SchedulerFactory = ({ boxes, baseInterval }) =>
  leitner({ boxes, baseInterval: baseInterval * 1000 });
