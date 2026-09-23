// packages/shared/components/blocks/rubric/Slot.ts
//
// One check on the sheet: what is judged, what it may be answered with, what
// it is worth. The text is the judging description the grader is shown.
//
// Renders nothing: rubric content is data other things are generated from.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Slot = core({
  ...parsers.text.raw(),
  name: 'Slot',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'One check on the sheet, with its verdicts and points. Renders nothing.',
  attributes: z.object({
    // THE TEMPLATE MARKER, accepted on every child a template may carry.
    // Consumed by materialisation and never written to the output, so a reader
    // of generated content never sees it. Named `ifDeclared` and not `cond`
    // because `cond` is real data elsewhere in a rubric.
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    key: z.string().describe('The check\'s name on the sheet.'),
    // The LABEL a learner sees beside the check, distinct from the judging
    // description in the element's text: one is shown, the other is read by
    // whoever grades. Every real slot carries one.
    label: z.string().optional().describe(
      'Human label for the check, shown in feedback.'),
    verdicts: z.string().optional().describe(
      'Verdicts this check may be answered with, "|"-separated or "@name" for a ' +
      'shared vocabulary. Satisfying one first.'),
    pts: z.coerce.number().optional().describe(
      'What it is worth. Omit for a check that reports rather than scores.'),
    seg: z.string().optional().describe(
      'How the answer is collected, when it is not a plain verdict.'),
    gate: z.enum(['true', 'false']).optional().describe(
      'An unsatisfied gate is the whole story for the item.'),
    // THE CREDIT SIDE of a slot. A slot that carries points is also a credit
    // component, and these are the fields that describes: which deduction
    // codes answer to it, the verdicts it may take, the judging rule, whether
    // it is reported rather than scored, and which verdicts cost nothing.
    // VERDICT-TO-CODE, not a list of codes. Which deduction is charged depends
    // on WHICH WAY the check failed: `absent` may charge one code and
    // `wrong_kind` another. A flat list could not say that, and measured on the
    // corpus this is a mapping on all 70 entries that have it.
    codes: z.string().optional().describe(
      'Which deduction each failing verdict charges, as ' +
      '"verdict=CODE,verdict=CODE".'),
    // A GATE THAT CHARGES. `gate` above says an unsatisfied check ends the
    // item; these two say what that costs and why. Separate from `codes`
    // because a gate is answered true or false rather than with a verdict, so
    // there is no verdict to key a mapping on. Measured on the corpus: the
    // charging gates run in slot order and the reason differs per gate while
    // the code repeats, so the reason cannot live on the <Deduction>.
    charge: z.string().optional().describe(
      'The deduction charged when this gate is unsatisfied.'),
    because: z.string().optional().describe(
      'The reason given when `charge` is charged, in the learner\'s feedback.'),
    rule: z.string().optional().describe(
      'Extra judging text. May contain {fail} for this check\'s failing ' +
      'verdict, or {fail:other} for a sibling\'s.'),
    // WHY A SECOND JUDGING FIELD, when `rule` is right there. They sit at
    // different heights: `rule` is what BOTH graders are told, and a note is
    // what a checklist-style grader is told where the credit rule does not
    // already say. Collapsing them would push every note into the shared text
    // and change what one grader is asked -- the migration this attribute exists
    // for is a RE-POINT, which moves where a note is stored and nothing else.
    //
    // LITERAL OR SHARED, the same two forms `verdicts` takes. A note that says
    // the same thing on nine slots should be written once and referenced, and
    // one that has to differ on a single item should be writable there without
    // disturbing the other eight. Sharing by default, varying by exception.
    note: z.string().optional().describe(
      'What this check means, where the credit rule does not already say. ' +
      'Literal text, or "@name" for a shared note.'),
    reported: z.enum(['true', 'false']).optional().describe(
      'The model reports this value rather than being judged on it.'),
    // A BOOLEAN, not a list. `gate` above marks a slot whose failure ends the
    // item; this marks a CREDIT line as gating. They are different facts about
    // the same slot and the corpus carries both.
    gates: z.enum(['true', 'false']).optional().describe(
      'This credit line gates the item: unsatisfied, it is the whole story.'),
    free: z.string().optional().describe(
      'Verdicts that are not satisfying and still cost nothing, comma-separated. ' +
      'DECLARED, never inferred: a code keyed on a counterpart name reads as ' +
      'missing and would forgive a real failure.'),
  }),
  // NOT `internal`. These are author-facing: the end state is a HAND-AUTHORED
  // rubric, and `internal` means "hidden from the docs, not for course authors",
  // which is the opposite of what these are becoming. A course still does not
  // SHOW them -- `_Course.tsx` filters on whether a block renders at all, which
  // is the property that actually matters and is true of every block here.
});

export default Slot;
