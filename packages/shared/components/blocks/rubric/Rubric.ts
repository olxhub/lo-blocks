// packages/shared/components/blocks/rubric/Rubric.ts
//
// A rubric: the single source of the judging data every scorer reads.
//
// It renders NOTHING. A rubric is not something a learner sees; it is content
// that other things are generated FROM -- prompt bodies, sheet attributes, and
// whatever a second consumer derives for itself. Keeping it a content object
// rather than a file means one authoring language, one parser, and one place a
// reviewer looks.
//
//   <Rubric id="course_rubric" title="Scoring rubric">
//     <Verdicts name="met_absent" values="met|absent"/>
//     <Frame name="judging"> ... </Frame>
//     <Deduction code="NO_ANSWER" pts="6">did not answer</Deduction>
//     <Item ref="q1" max="5"> ... </Item>
//   </Rubric>
//
// ACCEPTED AND IGNORED for a full stage before any content uses it (O1): the
// engine and the content version separately and no step lands in both at once,
// so the block must tolerate being unused.
//
// It holds no subject vocabulary and interprets none: `Verdicts`, `Frame`,
// `Deduction` and `Item` are structural, and every word inside them is data.

import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Rubric = core({
  ...parsers.blocks(),
  name: 'Rubric',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description:
    'The single source of judging data a course is scored against. Holds shared ' +
    'verdict vocabularies, prose frames, deduction wordings and per-item entries. ' +
    'Renders nothing.',
  // NO ATTRIBUTES OF ITS OWN. `id` and `title` are BASE attributes every block
  // already has, and redeclaring one is a composition conflict the factory
  // refuses rather than letting a layer silently win.
  internal: true,
});

export default Rubric;
