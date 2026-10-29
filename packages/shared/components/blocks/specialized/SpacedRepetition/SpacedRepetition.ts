// packages/shared/components/blocks/specialized/SpacedRepetition/SpacedRepetition.ts
//
// Spaced-repetition deck. Each child block is a flashcard; the block watches
// whether the learner answers it correctly and schedules the next review.
//
//   <SpacedRepetition id="deck" algorithm="leitner" boxes="5" baseInterval="1 day">
//     <CapaProblem id="card1">...</CapaProblem>
//     <MarkupProblem id="card2">...</MarkupProblem>
//   </SpacedRepetition>

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { z_olx_duration } from '@/lib/blocks/attributeSchemas';
import { SCHEDULER_NAMES } from './schedulers';

export const fields = state.fields([
  'cards',    // { [cardKey]: { algorithm, reps, state } } — written whole
  'current',  // { cardKey, rep, result, at } — the presentation on screen
]);

const SpacedRepetition = dev({
  ...parsers.blocks(),
  name: 'SpacedRepetition',
  description: 'Flashcard deck that schedules reviews of child problems with spaced repetition (Leitner boxes)',
  fields,
  attributes: z.object({
    algorithm: z.enum(SCHEDULER_NAMES).default('leitner').describe('Scheduling algorithm'),
    boxes: z.coerce.number().int().positive().default(5).describe('Leitner: number of boxes'),
    baseInterval: z_olx_duration.default('1 day').describe('Leitner: review interval for box 1; doubles with each box (e.g. "1 day", "10 minutes")'),
  }).strict(),
});

export default SpacedRepetition;
