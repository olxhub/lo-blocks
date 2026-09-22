// packages/shared/components/blocks/rubric/Forbid.ts
//
// A check that FAILS on a named COMBINATION of other answers.
//
// Each operand stays its own question, so the model is never asked to report
// the combination; the check is computed and left out of the response schema.
//
// Renders nothing: rubric content is data other things are generated from.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Forbid = core({
  ...parsers.ignore(),
  name: 'Forbid',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'A computed check that fails only when every named condition holds.',
  attributes: z.object({
    // THE TEMPLATE MARKER, accepted on every child a template may carry.
    // Consumed by materialisation and never written to the output, so a reader
    // of generated content never sees it. Named `ifDeclared` and not `cond`
    // because `cond` is real data elsewhere in a rubric.
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    key: z.string().describe('The check this computes.'),
    conds: z.string().optional().describe(
      'The conjunction, as "slot=value,slot=value". It fails only when ALL hold.'),
  }),
  internal: true,
});

export default Forbid;
