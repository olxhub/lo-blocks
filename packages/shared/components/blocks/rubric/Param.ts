// packages/shared/components/blocks/rubric/Param.ts
//
// One value an item supplies to its template, written as an element.
//
//   <Item scores="q1" use="@pair" max="4" params="abbrev=a">
//     <Param name="question">Write an example of Alpha Kind...</Param>
//   </Item>
//
// WHY BOTH FORMS EXIST. `params="name=value|name=value"` is right for short
// values and unusable for prose: authoring four real items produced 679-character
// attributes carrying a 351-character question, which no reviewer can read in a
// diff. Worse, the attribute grammar is delimited by `|` and `=`, and prose
// contains both -- a definition with an equation in it corrupts the parse
// silently.
//
// So: the attribute for identifiers and short strings, this for anything a
// person would call a sentence. The two merge, and a name given twice is an
// error rather than a silent winner.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Param = core({
  // RAW, like Segment: a value may end in a space that matters once it is
  // substituted into prose, and trimming it here would be invisible until the
  // assembled bytes were compared.
  ...parsers.text.raw(),
  name: 'Param',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description:
    'One value an item supplies to its template, for values too long or too ' +
    'punctuated for the params attribute. Renders nothing.',
  attributes: z.object({
    name: z.string().describe('The placeholder this fills, without braces.'),
  }),
  internal: true,
});

export default Param;
