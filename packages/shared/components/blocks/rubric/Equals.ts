// packages/shared/components/blocks/rubric/Equals.ts
//
// A check the grader COMPUTES by comparing two answers it already has.
//
// Renders nothing.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Equals = core({
  ...parsers.ignore(),
  name: 'Equals',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'A computed check: compares two answered checks.',
  attributes: z.object({
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    key: z.string().describe('The check this computes.'),
    left: z.string().describe('One answer.'),
    right: z.string().describe('The other.'),
    lenient: z.string().optional().describe(
      'Answers that establish no mismatch and are not charged, comma-separated.'),
    // THE LEDGER'S WORDING for the charge, on the rule that decides it. Not
    // emitted into the generated `equals=` attribute -- that is
    // `key:left,right:lenient`, and the web takes its student-facing text from
    // `<Deduction>` -- so this is the paper ledger's half of a rule the two
    // engines otherwise share. `{left}` and `{right}` style placeholders are
    // substituted by whichever scorer reads it.
    note: z.string().optional().describe(
      'How the charge reads when this comparison fails. Placeholders naming ' +
      'the two answers are substituted by the scorer.'),
  }),
  // NOT `internal`. These are author-facing: the end state is a HAND-AUTHORED
  // rubric, and `internal` means "hidden from the docs, not for course authors",
  // which is the opposite of what these are becoming. A course still does not
  // SHOW them -- `_Course.tsx` filters on whether a block renders at all, which
  // is the property that actually matters and is true of every block here.
});

export default Equals;
