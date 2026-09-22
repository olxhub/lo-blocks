// packages/shared/components/blocks/rubric/Verdicts.ts
//
// A named verdict vocabulary, defined once and referenced by many slots.
//
//   <Verdicts name="met_absent_unclear" values="met|absent|unclear"/>
//   <Slot key="k" verdicts="@met_absent_unclear"/>
//
// WHY IT IS SHARED RATHER THAN REPEATED. Two copies of a vocabulary are two
// vocabularies: they agree until one is edited. The engines already differ on
// this -- one credits only the satisfying verdict and fails everything else,
// the other charges only what a deduction code names -- so a vocabulary that
// drifts between them is scored two ways with nothing saying so.
//
// The ORDER is significant: the satisfying verdict is first, which is what the
// checklist renders and what a sheet attribute emits.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import { ignore } from '@/lib/content/parsers';

const Verdicts = core({
  ...ignore(),
  name: 'Verdicts',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description:
    'A named verdict vocabulary shared by many slots. The satisfying verdict is ' +
    'first. Renders nothing.',
  attributes: z.object({
    name: z.string().describe('The name slots reference with a leading "@".'),
    values: z.string().describe(
      'The verdicts, "|"-separated, SATISFYING ONE FIRST — e.g. "met|absent|unclear". ' +
      'Order is not cosmetic: it is what the generated checklist and sheet ' +
      'attribute both render.'),
  }),
  internal: true,
});

export default Verdicts;
