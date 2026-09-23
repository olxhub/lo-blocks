// packages/shared/components/blocks/rubric/ItemTemplate.ts
//
// A template says "these items are the same shape". The items say how they
// differ.
//
//   <ItemTemplate name="pair">
//     <Question>Give an example of {longName}.</Question>
//     <Slot key="is_{abbrev}" pts="2">Specifically {longName}</Slot>
//     <Forbid key="excluded" cond="hasExtra"/>
//   </ItemTemplate>
//
//   <Item scores="thing_a" use="@pair" params="longName=Alpha|abbrev=a"/>
//   <Item scores="thing_b" use="@pair" params="longName=Beta|abbrev=b"
//         conditions="hasExtra"/>
//
// WHY THIS AND NOT `Frame`. A frame varies WORDS; this varies WHAT THE SHEET
// ASKS. Measured on a twelve-item handout built from four helper functions: the
// pairs were 92-100% identical once serialised, yet three of four differed in
// their SLOT KEYS and one in a credit key derived from the parameter. Expanding
// them literally would have put ~86KB of near-duplicate content in the authored
// source, where one shared sentence then needs twelve edits.
//
// TWO OPERATIONS, the same two a frame has, applied to structure: `{name}`
// substitution -- INCLUDING inside attribute values, which is what lets a slot
// key vary -- and `cond=` on a child, included only where the item declares it.
//
// EXPANDED BY THE BUILD, not at read time. Generated content carries literal
// items, so a reader with its own parser needs no template grammar. See
// `lib/llm/itemTemplate.ts` for the expander and its rules.
//
// Renders nothing: a template is data about data.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const ItemTemplate = core({
  ...parsers.blocks(),
  name: 'ItemTemplate',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description:
    'A reusable item shape. Items reference it and supply the parameters and ' +
    'conditions that make them differ. Renders nothing.',
  attributes: z.object({
    name: z.string().describe('The name items reference with a leading "@".'),
  }),
  // NOT `internal`. These are author-facing: the end state is a HAND-AUTHORED
  // rubric, and `internal` means "hidden from the docs, not for course authors",
  // which is the opposite of what these are becoming. A course still does not
  // SHOW them -- `_Course.tsx` filters on whether a block renders at all, which
  // is the property that actually matters and is true of every block here.
});

export default ItemTemplate;
