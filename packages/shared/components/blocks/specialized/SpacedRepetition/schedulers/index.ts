// packages/shared/components/blocks/specialized/SpacedRepetition/schedulers/index.ts
//
// Registry of scheduling algorithms, keyed by the `algorithm` attribute.
//
// Adding one (e.g. SM-2): write `sm2.ts` exporting a SchedulerFactory whose
// Scheduler<S> implements ./types.ts with `now` injected, add it here, and
// add a test beside it. The `algorithm` attribute's allowed values come
// from this object, so nothing else changes. SM-2 would need a 0-5 quality
// grade; until graders report one, map 'correct' → 4 and 'incorrect' → 1.

import type { SchedulerFactory } from './types';
import { createLeitner } from './leitner';

export const SCHEDULERS: Record<string, SchedulerFactory> = {
  leitner: createLeitner,
};

export const SCHEDULER_NAMES = Object.keys(SCHEDULERS) as [string, ...string[]];

export type { Scheduler, SchedulerFactory, ReviewResult } from './types';
