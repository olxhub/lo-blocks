// packages/shared/components/blocks/rubric/Context.ts
//
// Another item whose answers this one may read, for cross-item consistency.
//
// Read-only: the referenced answers are shown to whoever grades and are never
// graded here.
//
// Renders nothing.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Context = core({
  ...parsers.ignore(),
  name: 'Context',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'Another items answers, shown read-only for consistency checks.',
  attributes: z.object({
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    item: z.string().describe('The other item.'),
  }),
  internal: true,
});

export default Context;
