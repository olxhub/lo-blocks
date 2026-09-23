// packages/shared/components/blocks/rubric/Item.ts
//
// One rubric entry: everything a scorer needs to judge one thing.
//
//   <Item scores="q1" max="5">
//     <Question>...</Question>
//     <Slot key="stated" verdicts="@met_absent" pts="2"><Desc>...</Desc></Slot>
//     <Guidance use="@judging"/>
//   </Item>
//
// THE ITEM REFERENCES ITS CONTENT BY ID; the content's own markup carries no
// rubric prose. That is the whole point of the migration: one source, and a
// page that changes wording without changing what it is scored against.
//
// `conditions` and `params` are NAMES AS DATA. They select frame segments and
// fill placeholders, and the engine knows only that a name was declared and a
// value supplied -- never what either means. The generator this replaces
// carried a named boolean per condition, which put subject vocabulary into the
// engine's own interface.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Item = core({
  ...parsers.blocks(),
  name: 'Item',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description:
    'One rubric entry: the question, its slots, its guidance and what it is ' +
    'worth. Renders nothing.',
  attributes: z.object({
    // `scores`, NOT `ref`: the platform reserves `ref` for <Use> elements and
    // the parser refuses it anywhere else. Worth knowing before authoring, not
    // after -- the reserved name is the natural one to reach for.
    scores: z.string().describe('The content element this entry scores.'),
    // WHAT THE ITEM IS ASKED THROUGH, as against what it scores. `scores` names
    // the rubric entry; this names the COMPONENT on the page whose answer it
    // judges. They are different identifiers and were kept in different files
    // until now -- which meant the link between an item and its component was
    // written twice and agreed only by habit.
    asks: z.string().optional().describe(
      'The id of the component this item judges. Omit for an item scored '
      + 'without a component of its own.'),
    // THE PATTERN THIS ITEM WAS BUILT FROM. Items sharing a family share slot
    // NAMES, and those names must therefore mean the same thing across it -- the
    // property a sibling-structure check tests. Scoped by family rather than
    // corpus-wide on purpose: the same slot name legitimately differs between
    // items that are not siblings.
    family: z.string().optional().describe(
      'The pattern this item was built from. Items sharing a family share slot '
      + 'names, which must mean the same thing across it.'),
    // WHICH SCORING RULE RUNS, not how the sheet is built -- `deriveFrom*` above
    // decides that. A name, never interpreted here: what any of these MEAN is the
    // scorer's business, which is what keeps this engine free of the course.
    grading: z.string().optional().describe(
      'Which scoring rule this item takes, by name.'),
    max: z.coerce.number().optional().describe(
      'Points available. Omit to let the runtime total the slots.'),
    deriveFromClauses: z.enum(['true', 'false']).optional().describe(
      'Build the judging sheet from declared clauses rather than from the ' +
      'credit components.'),
    conditions: z.string().optional().describe(
      'Condition names this item declares, "|"-separated, matched against a ' +
      'frame segment\'s `when`.'),
    params: z.string().optional().describe(
      'Values for placeholders in a frame or an item template, as ' +
      '"name=value|name=value".'),
    label: z.string().optional().describe(
      'How this entry is named to a human reader.'),
    increment: z.coerce.number().optional().describe(
      'The smallest step a score may move by.'),
    deriveFromCredit: z.enum(['true', 'false']).optional().describe(
      'Build the judging sheet from the credit components. The sibling of ' +
      '`deriveFromClauses`, and the two are not the same sheet.'),
    blankCode: z.string().optional().describe(
      'The deduction charged when nothing was answered.'),
    expectedType: z.string().optional().describe(
      'The answer this entry is looking for, where one is fixed in advance.'),
    unreachableCodes: z.string().optional().describe(
      'Deduction codes declared here that nothing can charge, comma-separated. ' +
      'DECLARED so an audit can tell a dead code from an unnoticed one.'),
    use: z.string().optional().describe(
      'An ItemTemplate this entry is built from, referenced with a leading ' +
      '"@". The template carries the shape; `params` and `conditions` carry ' +
      'everything this item does differently. Expanded by the BUILD, so ' +
      'generated content holds a literal item.'),
  }),
  // NOT `internal`. These are author-facing: the end state is a HAND-AUTHORED
  // rubric, and `internal` means "hidden from the docs, not for course authors",
  // which is the opposite of what these are becoming. A course still does not
  // SHOW them -- `_Course.tsx` filters on whether a block renders at all, which
  // is the property that actually matters and is true of every block here.
});

export default Item;
