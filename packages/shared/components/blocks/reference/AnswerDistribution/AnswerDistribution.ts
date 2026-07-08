// packages/shared/components/blocks/reference/AnswerDistribution/AnswerDistribution.ts
//
// The Learning Catalytics primitive: point at any input block and show
// the class-wide distribution of answers, versus your own —
//
//   <ChoiceInput id="q1">…</ChoiceInput>
//   <AnswerDistribution target="q1"/>
//
// The input stays completely ordinary (it doesn't know it's being
// aggregated), so every existing input type is already aggregatable.
// The distribution is a server-side fold over answer TRANSITIONS
// (lib/state/sync/aggregations.ts): a student who changes their answer
// moves their count from the old bin to the new one, and a student who
// re-sends the same answer twelve times counts once — one user, one
// count, by construction.
//
// Seeding: seed='{"Paris": 12, "London": 3}' initializes an empty
// distribution — prior-semester data as content, versioned with the
// course. The client shows the seed before the first contribution; the
// server folds on top of it.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import type { Transition } from '@/lib/state/sync/aggregations';

/** One count per bin, keyed by the answer's display string. */
export function histogramFold(derived: Record<string, number>, { prev, next }: Transition) {
  const counts = { ...derived };
  const bin = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (prev !== undefined && prev !== null && prev !== '') {
    const key = bin(prev);
    counts[key] = (counts[key] ?? 1) - 1;
    if (counts[key] <= 0) delete counts[key];
  }
  if (next !== undefined && next !== null && next !== '') {
    const key = bin(next);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export const fields = state.fields([
  {
    name: 'distribution',
    people: { everyone: 'derived' },
    aggregate: { over: 'value', fold: histogramFold, initial: {} },
  },
]);

const attributes = z.object({
  target: z.string().describe('Id of the input block whose answers to aggregate'),
  seed: z.string().optional()
    .describe('Initial distribution as JSON (e.g. prior-semester data): {"Paris": 12, "London": 3}'),
  showBeforeAnswer: z.string().optional()
    .describe('Set "true" to show the distribution before the viewer has answered (default: hidden until they answer — the Peer Instruction discipline)'),
});

const AnswerDistribution = core({
  ...parsers.ignore(),
  name: 'AnswerDistribution',
  description: 'Class-wide distribution of answers to a target input, versus your own (Learning Catalytics-style).',
  fields,
  attributes,
});

export default AnswerDistribution;
