// packages/shared/components/blocks/rubric/Onlyif.ts
//
// A charge that applies only while another check holds.
//
// `cond` here is REAL DATA -- the check depended on -- and is not the template
// marker, which is `ifDeclared`. One word cannot mean both.
//
// Renders nothing: rubric content is data other things are generated from.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Onlyif = core({
  ...parsers.ignore(),
  name: 'Onlyif',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'A charge that applies only while another check is satisfied.',
  attributes: z.object({
    // THE TEMPLATE MARKER, accepted on every child a template may carry.
    // Named `ifDeclared` and not `cond` precisely because THIS block already
    // uses `cond` for real data -- the check the charge depends on.
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    key: z.string().describe('The check whose charge is conditional.'),
    cond: z.string().describe('The check that must hold for it to be charged.'),
  }),
  internal: true,
});

export default Onlyif;
