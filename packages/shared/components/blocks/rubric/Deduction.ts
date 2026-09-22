// packages/shared/components/blocks/rubric/Deduction.ts
//
// A deduction code, its cost, and the canonical wording it is charged in.
//
//   <Deduction code="NO_ANSWER" pts="6">did not answer</Deduction>
//   <Deduction code="MISSING_ONE" pts="2" repeatable>-2 pts: missing one</Deduction>
//
// THE WORDING IS PART OF THE DATA. A deduction that costs points and says
// nothing leaves the learner with a lower score and no account of it, so the
// text travels with the code rather than being composed at the point of use.
//
// `repeatable` is not cosmetic: a charge that can apply more than once, read as
// applying once, silently under-charges every response that earns it twice.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Deduction = core({
  ...parsers.text.raw(),
  name: 'Deduction',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description:
    'A deduction code, its cost in points, and the canonical wording charged ' +
    'with it. Renders nothing.',
  attributes: z.object({
    // THE TEMPLATE MARKER, accepted on every child a template may carry.
    // Consumed by materialisation and never written to the output, so a reader
    // of generated content never sees it. Named `ifDeclared` and not `cond`
    // because `cond` is real data elsewhere in a rubric.
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    code: z.string().describe('The code a rule charges.'),
    pts: z.coerce.number().describe('What it costs.'),
    repeatable: z.enum(['true', 'false']).optional().describe(
      'Chargeable more than once against one response. Read as once when it is ' +
      'not, this under-charges silently.'),
  }),
  internal: true,
});

export default Deduction;
