// packages/shared/components/blocks/rubric/Cover.ts
//
// Checks that between them must COVER a set of labels; the grader does the
// pairing rather than being told which check answers which label.
//
// Renders nothing.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Cover = core({
  ...parsers.ignore(),
  name: 'Cover',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'A set of checks that must cover a set of labels.',
  attributes: z.object({
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    // `checks`, NOT `keys`: `keys` is a reserved expression-language keyword
    // and the factory refuses it as an attribute name. The fifth reserved word
    // this migration has walked into, after `ref`, `when`, `id`/`title` and
    // `cond` -- each found by authoring rather than by reading.
    checks: z.string().describe('The checks, comma-separated.'),
    labels: z.string().describe('The labels they must cover, comma-separated.'),
    // `item`, NOT `of`: the SIXTH reserved expression-language keyword this
    // migration has walked into, after `ref`, `id`/`title`, `when`, `cond` and
    // `keys`. `item` is what <Context> already calls the same thing.
    item: z.string().optional().describe(
      'The entry whose labels these are, where they are another entry\'s.'),
    verdicts: z.string().optional().describe(
      'Verdicts each check may take, "|"-separated or "@name".'),
  }),
  // NOT `internal`. These are author-facing: the end state is a HAND-AUTHORED
  // rubric, and `internal` means "hidden from the docs, not for course authors",
  // which is the opposite of what these are becoming. A course still does not
  // SHOW them -- `_Course.tsx` filters on whether a block renders at all, which
  // is the property that actually matters and is true of every block here.
});

export default Cover;
