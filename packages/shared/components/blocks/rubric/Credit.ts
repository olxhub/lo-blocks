// packages/shared/components/blocks/rubric/Credit.ts
//
// One credit component: what earns points, what it is worth, and how to judge it.
//
// SEPARATE FROM <Slot>, and that separation is measured rather than tidy. A
// slot is a line on the ANSWER SHEET; a credit component is a line in the
// SCORING. They often coincide, which is why the first model merged them -- and
// on the corpus they diverge twice over:
//
//   * ELEVEN of twenty-six items list their credit in a different ORDER than
//     their slots, and the order is what the generated prompt renders.
//   * FOUR items have credit whose keys are not slots at all: an item scored
//     from declared criteria earns its points without a sheet line to hang them
//     on.
//
// Merging them produced prompts that listed the right components in the wrong
// order, which reads as correct until it is diffed.
//
// Renders nothing.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Credit = core({
  ...parsers.text.raw(),
  name: 'Credit',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description:
    'One credit component: what earns points, what it is worth, and the ' +
    'judging description shown to whoever grades. Renders nothing.',
  attributes: z.object({
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    what: z.string().describe('The check this credit is for.'),
    pts: z.coerce.number().optional().describe(
      'What it is worth. Omit for a component that reports rather than scores.'),
    verdicts: z.string().optional().describe(
      'Verdicts it may take, "|"-separated or "@name" for a shared vocabulary.'),
    codes: z.string().optional().describe(
      'Which deduction each failing verdict charges, as "verdict=CODE,verdict=CODE". ' +
      'A MAPPING, because which deduction applies depends on HOW it failed.'),
    rule: z.string().optional().describe(
      'Extra judging text. May contain {fail} for this check\'s failing verdict, ' +
      'or {fail:other} for a sibling\'s.'),
    reported: z.enum(['true', 'false']).optional().describe(
      'Reported rather than judged.'),
    gates: z.enum(['true', 'false']).optional().describe(
      'Unsatisfied, this component is the whole story for the item.'),
    free: z.string().optional().describe(
      'Verdicts that are not satisfying and still cost nothing, comma-separated. ' +
      'DECLARED, never inferred.'),
  }),
  // NOT `internal`. These are author-facing: the end state is a HAND-AUTHORED
  // rubric, and `internal` means "hidden from the docs, not for course authors",
  // which is the opposite of what these are becoming. A course still does not
  // SHOW them -- `_Course.tsx` filters on whether a block renders at all, which
  // is the property that actually matters and is true of every block here.
});

export default Credit;
