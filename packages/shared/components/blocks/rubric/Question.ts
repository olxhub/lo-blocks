// packages/shared/components/blocks/rubric/Question.ts
//
// The question as it was put to the learner.
//
// Held here so a scorer can be shown WHAT WAS ASKED without reading the page,
// and so the page can be reworded without changing what it is scored against.
//
// Renders nothing: rubric content is data other things are generated from.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Question = core({
  ...parsers.text.raw(),
  name: 'Question',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'The question as put to the learner. Renders nothing.',
  attributes: z.object({
    // THE TEMPLATE MARKER, accepted on every child a template may carry.
    // Consumed by materialisation and never written to the output, so a reader
    // of generated content never sees it. Named `ifDeclared` and not `cond`
    // because `cond` is real data elsewhere in a rubric.
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),

  }),
  // NOT `internal`. These are author-facing: the end state is a HAND-AUTHORED
  // rubric, and `internal` means "hidden from the docs, not for course authors",
  // which is the opposite of what these are becoming. A course still does not
  // SHOW them -- `_Course.tsx` filters on whether a block renders at all, which
  // is the property that actually matters and is true of every block here.
});

export default Question;
