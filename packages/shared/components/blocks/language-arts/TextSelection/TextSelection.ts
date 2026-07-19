// packages/shared/components/blocks/language-arts/TextSelection/TextSelection.ts
//
// The terse one-tag spelling of a text-highlighting problem. <TextSelection>
// is a thin composition: it parses the passage once and generates the
// TextSelectionGrader → TextSelectionInput pair, then reuses CapaProblem's
// renderer and grading machinery (the MarkupProblem pattern). All the real
// behavior lives in the generated input and grader; this file only wires them
// and maps the authoring `mode` onto standard problem semantics.
//
//   mode="immediate" (default) → grade="immediate": correctness derives live,
//                                no button.
//   mode="graded"              → grade="submit": the standard Check button and
//                                submit-time grading.
//   mode="selfcheck"           → grade="submit" + showanswer="always": the
//                                learner selects and reveals the answer to
//                                compare (grading is available but incidental).
//
import { z } from 'zod';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser, directKidIds } from '@/lib/content/parsers';
import { src } from '@/lib/blocks';
import { problemAttributes } from '@/lib/blocks/attributeSchemas';
import { gradingSelectors, problemGradeMode } from '@/lib/grading';
import { splitNs, asDefinitionRef, joinDefinitionRef, parseLeafId } from '@/lib/types/id-grammar';
import type { KidEntry, DefinitionRef } from '@/lib/types';
import * as parser from './_textSelectionParser';

const INPUT  = parseLeafId('input');
const GRADER = parseLeafId('grader');

const blockRef = (id: DefinitionRef): KidEntry => ({ type: 'block', id });

// Map the authoring mode onto the problem attributes CapaProblem's renderer
// reads. Returns the (grade, showanswer) the generated problem should carry.
function problemAttrsForMode(mode: string): { grade: 'immediate' | 'submit'; showanswer?: string } {
  switch (mode) {
    case 'graded':    return { grade: 'submit' };
    case 'selfcheck': return { grade: 'submit', showanswer: 'always' };
    case 'immediate':
    default:          return { grade: 'immediate' };
  }
}

/**
 * Generate the grader→input pair from the parsed passage. Mirrors
 * MarkupProblem.generateProblemComponents: store the child entries and return
 * the problem's kids. The passage parse is handed to the input as pre-parsed
 * kids so it renders without re-parsing.
 */
function generateComposition({ parsed, storeEntry, id, attributes }) {
  const parentRef = asDefinitionRef(splitNs(id).path);

  // Resolve mode → problem attributes, and stamp them onto THIS block's own
  // attributes so CapaProblem's renderer (which reads props.grade /
  // props.showanswer) behaves. Done after Zod validation of the authored
  // `mode`; the extra keys are stored raw, exactly like CapaProblem's
  // auto-wired target= additions.
  const { grade, showanswer } = problemAttrsForMode(attributes.mode ?? 'immediate');
  attributes.grade = grade;
  if (showanswer) attributes.showanswer = showanswer;

  const inputId = joinDefinitionRef(parentRef, INPUT, 0);
  const graderId = joinDefinitionRef(parentRef, GRADER, 0);

  // The input carries the parsed passage as pre-parsed kids.
  storeEntry(inputId, {
    id: inputId,
    tag: 'TextSelectionInput',
    attributes: { id: inputId },
    kids: { type: 'parsed', parsed },
  });

  // The grader is a boundary grader of this problem — stamp its grading mode
  // (parse-time static-DOM fact; grading derivation never walks the DOM).
  const gradeMode = problemGradeMode(attributes);
  storeEntry(graderId, {
    id: graderId,
    tag: 'TextSelectionGrader',
    attributes: { id: graderId, target: inputId, gradeMode },
    kids: [blockRef(inputId)],
  });

  return [blockRef(graderId)];
}

// Metagrader like CapaProblem/MarkupProblem: aggregate grading state is derived
// on read, never stored. Only showAnswer is genuine state.
export const fields = state.fields([state.commonFields.showAnswer]);

const TextSelection = test({
  ...peggyParser(parser, { postprocess: generateComposition, skipStoreEntry: false }),
  name: 'TextSelection',
  category: 'language-arts',
  description: 'Text-highlighting problem: the learner selects words or phrases marked in the passage. Expands to a TextSelectionGrader + TextSelectionInput pair.',
  // Reuses CapaProblem's renderer (header/content/footer) rather than a sibling
  // component, exactly as MarkupProblem does.
  componentLoader: () => import('@/components/blocks/CapaProblem/_CapaProblem').then(m => m.default),
  fields,
  isGrader: true,  // Metagrader: aggregates the child grader's state.
  selectors: gradingSelectors,
  attributes: z.object({
    mode: z.enum(['immediate', 'graded', 'selfcheck']).optional()
      .describe('Interaction mode: "immediate" (live feedback, default), "graded" (Check button), or "selfcheck" (reveal answer to compare)'),
    // The problem attributes CapaProblem's renderer reads. `mode` is the
    // author-facing knob; generateComposition derives grade/showanswer from it
    // and stamps them here, so they must be in the schema (render re-validates).
    ...problemAttributes.shape,
    ...src,  // Optional external passage file (peggyParser loads it).
  }).strict(),
  // peggyParser sets staticKids: () => [], but this block generates child
  // blocks during parsing; report them so the content API ships them.
  staticKids: directKidIds,
});

export default TextSelection;
