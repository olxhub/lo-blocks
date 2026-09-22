// packages/shared/components/blocks/rubric/Guidance.ts
//
// A line of grading guidance, or a reference to a shared frame of them.
//
//   <Guidance>Count generously; quality of insight is not the question here.</Guidance>
//   <Guidance use="@oc_criteria"/>
//
// TWO FORMS, ONE BLOCK. A line written here belongs to this item; a `use=`
// pulls in prose shared across items, assembled from that frame's segments
// against the conditions this item declares. Splitting them into two block
// types would make "guidance" mean two things depending on which tag an author
// happened to reach for.
//
// Renders nothing.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Guidance = core({
  ...parsers.text.raw(),
  name: 'Guidance',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description:
    'A line of grading guidance, or a reference to a shared frame of them. ' +
    'Renders nothing.',
  attributes: z.object({
    use: z.string().optional().describe(
      'A Frame of shared guidance, referenced with a leading "@". Its segments ' +
      'are selected against the conditions this item declares.'),
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
  }),
  internal: true,
});

export default Guidance;
