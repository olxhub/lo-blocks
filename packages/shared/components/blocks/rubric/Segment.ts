// packages/shared/components/blocks/rubric/Segment.ts
//
// One piece of a Frame. Segments concatenate in document order.
//
// A whole clause is just a segment that happens to be one, so this covers both
// clause-level selection and a sentence spliced mid-clause -- the case that
// forced the finer unit.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Segment = core({
  // RAW, so leading and trailing whitespace SURVIVES. A segment is spliced
  // between two others, and the space before "This never changes..." is what
  // joins it to the sentence in front. The default text parser trims, which
  // silently closes that gap and makes byte-exact prose impossible.
  ...parsers.text.raw(),
  name: 'Segment',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description:
    'One piece of a Frame, included when its condition holds. Renders nothing.',
  attributes: z.object({
    // `ifDeclared`: NOT `when` (a BASE attribute that gates RENDERING by
    // expression) and NOT `cond` (real data on other rubric children, where it
    // names a check a charge depends on). One vocabulary for one mechanism.
    // The older note, kept because the reasoning still holds:
    // `when` is a BASE attribute on every block and it
    // already means something else -- an expression that gates RENDERING. A
    // segment is selected by a NAME the item declares, which is a different
    // mechanism, and reusing the word would have made one attribute mean two
    // things depending on the tag it sat on.
    ifDeclared: z.string().optional().describe(
      'Include this segment only when the item declares this condition name. ' +
      'Prefix with "!" to include it only when the item does NOT. Absent ' +
      'means always.'),
  }),
  // NOT `internal`. These are author-facing: the end state is a HAND-AUTHORED
  // rubric, and `internal` means "hidden from the docs, not for course authors",
  // which is the opposite of what these are becoming. A course still does not
  // SHOW them -- `_Course.tsx` filters on whether a block renders at all, which
  // is the property that actually matters and is true of every block here.
});

export default Segment;
