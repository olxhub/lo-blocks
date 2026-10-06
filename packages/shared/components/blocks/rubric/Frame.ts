// packages/shared/components/blocks/rubric/Frame.ts
//
// Shared prose, written once and used by many items.
//
//   <Frame name="judging">
//     <Segment>Answer these in order...</Segment>
//     <Segment when="!scores_it">This never changes the score. </Segment>
//     <Segment when="timed">Can it be settled inside ONE {unit}?</Segment>
//   </Frame>
//   <Item ref="q1"><Guidance use="@judging"/></Item>
//
// THE UNIT IS A SEGMENT, NOT A CLAUSE, and that is measured rather than
// preferred. In the corpus this was designed against, one numbered clause of a
// shared frame varies by a sentence spliced INSIDE it -- suppressed on the one
// item where that reading gates the score. A clause-level mechanism would have
// to store two copies of the clause, and two copies of a rule are two rules:
// the second scorer here once held a hand-kept "verbatim" copy of this very
// frame and it had drifted in three places before anyone noticed.
//
// Selection is by NAME and substitution is by NAME. The engine tests whether an
// item declares a condition and fills a placeholder it is given a value for; it
// never learns what either means.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Frame = core({
  ...parsers.blocks(),
  name: 'Frame',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description:
    'Shared prose assembled from segments, selected per item by condition and ' +
    'filled by named parameter. Renders nothing.',
  attributes: z.object({
    name: z.string().describe('The name items reference with a leading "@".'),
  }),
  // NOT `internal`. These are author-facing: the end state is a HAND-AUTHORED
  // rubric, and `internal` means "hidden from the docs, not for course authors",
  // which is the opposite of what these are becoming. A course still does not
  // SHOW them -- `_Course.tsx` filters on whether a block renders at all, which
  // is the property that actually matters and is true of every block here.
});

export default Frame;
