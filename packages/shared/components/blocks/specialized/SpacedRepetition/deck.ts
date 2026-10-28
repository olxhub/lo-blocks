// packages/shared/components/blocks/specialized/SpacedRepetition/deck.ts
//
// Pure deck logic for SpacedRepetition: reconciling stored schedules with
// the authored cards, choosing what to show, and recording reviews.
// Scheduler-agnostic; `now` is always injected.

import type { Scheduler, ReviewResult } from './schedulers';

/** Stored per card. `algorithm` lets a deck switch schedulers safely. */
export interface CardRecord {
  algorithm: string;
  reps: number;
  state: unknown;
}

export type Cards = Record<string, CardRecord>;

/**
 * The presentation on screen. `rep` is a deck-wide counter, bumped on every
 * presentation, which scopes the child's state so each one starts blank.
 * `cardKey` is null when nothing was due at time `at`.
 */
export interface Current {
  cardKey: string | null;
  rep: number;
  result: ReviewResult | null;
  at: number;
}

/**
 * Bring stored cards in line with the authored ones: drop removed cards,
 * initialize new ones (and ones stored under another algorithm).
 */
export function reconcileCards(cards: Cards | null, keys: string[], scheduler: Scheduler<any>, now: number): { cards: Cards; changed: boolean } {
  const stored = cards ?? {};
  const upToDate = (key: string) => key in stored && stored[key].algorithm === scheduler.name;
  if (cards && keys.every(upToDate) && Object.keys(stored).length === keys.length) return { cards, changed: false };
  const reconciled = Object.fromEntries(keys.map(key => [
    key,
    upToDate(key)
      ? stored[key]
      : { algorithm: scheduler.name, reps: key in stored ? stored[key].reps : 0, state: scheduler.initCard(now) },
  ]));
  return { cards: reconciled, changed: true };
}

function ranked(cards: Cards, keys: string[], compare: (a: unknown, b: unknown) => number): string[] {
  return keys
    .map((key, index) => ({ key, index }))
    .filter(({ key }) => key in cards)
    .sort((a, b) => compare(cards[a.key].state, cards[b.key].state) || a.index - b.index)
    .map(({ key }) => key);
}

/** Due card to review now: lowest priority, then earliest due, then deck order. */
export function selectNext(cards: Cards, keys: string[], scheduler: Scheduler<any>, now: number): string | null {
  const due = keys.filter(key => key in cards && scheduler.isDue(cards[key].state, now));
  const [first] = ranked(cards, due, (a, b) =>
    scheduler.priority(a) - scheduler.priority(b) || scheduler.dueAt(a) - scheduler.dueAt(b));
  return first ?? null;
}

/** Card due soonest, due or not — for studying ahead. */
export function selectSoonest(cards: Cards, keys: string[], scheduler: Scheduler<any>): string | null {
  const [first] = ranked(cards, keys, (a, b) =>
    scheduler.dueAt(a) - scheduler.dueAt(b) || scheduler.priority(a) - scheduler.priority(b));
  return first ?? null;
}

export function countDue(cards: Cards, keys: string[], scheduler: Scheduler<any>, now: number): number {
  return keys.filter(key => key in cards && scheduler.isDue(cards[key].state, now)).length;
}

export function recordReview(cards: Cards, key: string, scheduler: Scheduler<any>, result: ReviewResult, now: number): Cards {
  const card = cards[key];
  if (!card) throw new Error(`SpacedRepetition: no schedule for card "${key}"`);
  return { ...cards, [key]: { ...card, reps: card.reps + 1, state: scheduler.record(card.state, result, now) } };
}
