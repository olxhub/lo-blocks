// packages/shared/components/blocks/rubric/Expect.ts
//
// A check the grader COMPUTES by comparing an answer against a value the
// rubric names. Not asked of the model: it is arithmetic, not a judgement.
//
// Renders nothing: rubric content is data other things are generated from.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Expect = core({
  ...parsers.ignore(),
  name: 'Expect',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'A computed check: holds when a named answer equals a named value.',
  attributes: z.object({
    // THE TEMPLATE MARKER, accepted on every child a template may carry.
    // Consumed by materialisation and never written to the output, so a reader
    // of generated content never sees it. Named `ifDeclared` and not `cond`
    // because `cond` is real data elsewhere in a rubric.
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    key: z.string().describe('The check this computes.'),
    left: z.string().describe('The answer it reads.'),
    value: z.string().describe('The value it must equal.'),
    lenient: z.string().optional().describe(
      'Answers that establish nothing and are not charged, comma-separated.'),
      // WHICH ITEM'S EXPECT IS THE EXPORTED TABLE'S. Five items carry an
      // <Expect>; handout 2's builder assigned ONE of them from the `EXPECT`
      // table it exports and the rest from a private table it does not, so the
      // component held the merged result and could not say which was which.
      // That was the last fact the course file still needed the builder for.
      // Marking it here lets the reader derive the table from the component.
      authored: z.string().optional().describe(
        'Set "true" on the one Expect that belongs to the exported EXPECT ' +
        'table, so the table can be derived from the component.'),
  }),
  // NOT `internal`. These are author-facing: the end state is a HAND-AUTHORED
  // rubric, and `internal` means "hidden from the docs, not for course authors",
  // which is the opposite of what these are becoming. A course still does not
  // SHOW them -- `_Course.tsx` filters on whether a block renders at all, which
  // is the property that actually matters and is true of every block here.
});

export default Expect;
