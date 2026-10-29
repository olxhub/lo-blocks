// packages/shared/components/blocks/specialized/SpacedRepetition/schedulers/types.ts
//
// The contract every SpacedRepetition scheduling algorithm implements.
//
// Schedulers are pure: no clock, no React, no Redux. `now` (epoch ms) is
// always passed in, so they are deterministic and unit-testable. Per-card
// state `S` must be plain JSON — it is stored in a field and replayed.

// The problem's correctness, reduced to what a scheduler acts on. 'gaveUp'
// is a "Don't know" give-up. The project's default ordering (see
// correctnessPriority) is incorrect < gaveUp < correct; a scheduler may
// act on it differently, and the Leitner one does not yet distinguish them.
export type ReviewResult = 'correct' | 'incorrect' | 'gaveUp';

export interface Scheduler<S> {
  name: string;
  /** State for a card the learner has never seen. */
  initCard(now: number): S;
  isDue(card: S, now: number): boolean;
  /** When the card is next due, as epoch ms. */
  dueAt(card: S): number;
  /** Lower numbers are reviewed first among due cards (e.g. Leitner box). */
  priority(card: S): number;
  /** State after one review. Never mutates `card`. */
  record(card: S, result: ReviewResult, now: number): S;
}

/** Builds a scheduler from the block's (zod-parsed) attributes. */
export type SchedulerFactory = (attributes: { boxes: number; baseInterval: number }) => Scheduler<any>;
