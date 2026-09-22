// packages/shared/components/blocks/rubric/Map.ts
//
// A check COMPUTED by mapping one pick's value to a named verdict, so a check
// with more than one kind of failure is derived rather than asked.
//
// Renders nothing.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Map = core({
  ...parsers.ignore(),
  name: 'Map',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'A computed check: maps a picks value to a verdict.',
  attributes: z.object({
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    key: z.string().describe('The check this computes.'),
    pick: z.string().describe('The pick whose value it reads.'),
    pairs: z.string().optional().describe(
      'Value-to-verdict pairs as "value~verdict,value~verdict".'),
    fallback: z.string().optional().describe('The verdict anything else gets.'),
  }),
  internal: true,
});

export default Map;
