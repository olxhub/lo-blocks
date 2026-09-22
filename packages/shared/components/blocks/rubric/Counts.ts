// packages/shared/components/blocks/rubric/Counts.ts
//
// A repeated element counted ONCE, its members derived from the number.
//
// The model answers HOW MANY; the grader awards that many members. Asking each
// member separately invites a different answer to the same question.
//
// Renders nothing.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Counts = core({
  ...parsers.ignore(),
  name: 'Counts',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'A counting group: one number, members derived from it.',
  attributes: z.object({
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    key: z.string().describe('The check answered with a number.'),
    slots: z.string().optional().describe(
      'The members it awards, comma-separated.'),
  }),
  internal: true,
});

export default Counts;
