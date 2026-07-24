// packages/shared/components/blocks/language-arts/TextSelection/SimpleTextSelection.ts
//
// The terse one-tag spelling of a text-highlighting problem. <SimpleTextSelection>
// is a thin composition, exactly like SimpleSortable: it parses the passage once
// and, in postprocess, generates a REAL CapaProblem wrapping the
// TextSelectionGrader → TextSelectionInput pair. The block itself renders
// nothing (it reuses the shared _Noop renderer); the generated CapaProblem owns
// the header/footer/grading chrome and the showAnswer state.
//
// The authoring `mode` maps onto standard CapaProblem semantics, and everything
// else the author writes on the tag (title, maxAttempts, ...) passes through to
// the generated CapaProblem:
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
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser, directKidIds } from '@/lib/content/parsers';
import { src } from '@/lib/blocks/attributeSchemas';
import { problemGradeMode } from '@/lib/grading';
import { splitNs, asDefinitionRef, joinDefinitionRef, parseLeafId } from '@/lib/types/id-grammar';
import type { KidEntry, DefinitionRef } from '@/lib/types';
import * as parser from './_textSelectionParser';

// Typed child-role suffixes for joinDefinitionRef (validated once at import).
const PROBLEM = parseLeafId('problem');
const GRADER  = parseLeafId('grader');
const INPUT   = parseLeafId('input');

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
 * Generate the CapaProblem → grader → input subtree from the parsed passage.
 * Mirrors SimpleSortable.generateSortableComponents: store the child entries
 * and return this block's kids (just the problem). The passage parse is handed
 * to the input as pre-parsed kids so it renders without re-parsing.
 */
function generateComposition({ parsed, storeEntry, id, attributes }) {
  const parentRef = asDefinitionRef(splitNs(id).path);
  const problemId = joinDefinitionRef(parentRef, PROBLEM);
  const graderId  = joinDefinitionRef(parentRef, GRADER);
  const inputId   = joinDefinitionRef(parentRef, INPUT);

  // `mode` and `src` are consumed here; the block's own `id` is replaced by the
  // generated problemId. Everything else (title, maxAttempts, ...) passes
  // through to the CapaProblem. Order matters: the mode mapping wins over any
  // stray grade/showanswer the author passed through.
  const { mode, src: _src, id: _id, ...passthrough } = attributes;
  const problemAttrs = {
    id: problemId,
    ...passthrough,
    ...problemAttrsForMode(mode ?? 'immediate'),
  };

  // The input carries the parsed passage as pre-parsed kids.
  storeEntry(inputId, {
    id: inputId,
    tag: 'TextSelectionInput',
    attributes: { id: inputId },
    kids: { type: 'parsed', parsed },
  });

  // The grader is the boundary grader of the generated problem. capaParser
  // stamps a hand-authored problem's grading mode onto its boundary graders at
  // parse time; because we store the CapaProblem entry directly (its parser
  // never re-runs), we replicate that stamp here — exactly as MarkupProblem does.
  // gradeModeOf reads this at grade time; without it, immediate mode never fires.
  const gradeMode = problemGradeMode(problemAttrs);
  storeEntry(graderId, {
    id: graderId,
    tag: 'TextSelectionGrader',
    attributes: { id: graderId, target: inputId, gradeMode },
    kids: [blockRef(inputId)],
  });

  // The real CapaProblem container: owns the chrome, footer, and showAnswer.
  storeEntry(problemId, {
    id: problemId,
    tag: 'CapaProblem',
    attributes: problemAttrs,
    kids: [blockRef(graderId)],
  });

  return [blockRef(problemId)];
}

export const fields = state.fields([]);

const SimpleTextSelection = dev({
  ...peggyParser(parser, { postprocess: generateComposition, skipStoreEntry: false }),
  name: 'SimpleTextSelection',
  category: 'language-arts',
  description: 'Text-highlighting problem in a terse one-tag syntax: the learner selects words or phrases marked in the passage. Expands to a CapaProblem wrapping a TextSelectionGrader + TextSelectionInput.',
  // Non-conventional: this block doesn't render itself — it generates a
  // CapaProblem subtree in postprocess, so it reuses the shared layout Noop
  // renderer (the SimpleSortable / MarkupProblem pattern).
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  fields,
  // `mode` and `src` are the author-facing knobs; passthrough lets the generated
  // CapaProblem receive title/maxAttempts/etc. without re-declaring the whole
  // problem schema here (the SimpleSortable srcAttributes.passthrough() approach).
  attributes: z.object({
    mode: z.enum(['immediate', 'graded', 'selfcheck']).optional()
      .describe('Interaction mode: "immediate" (live feedback, default), "graded" (Check button), or "selfcheck" (reveal answer to compare)'),
    ...src,  // Optional external passage file (peggyParser loads it).
  }).passthrough(),
  // peggyParser sets staticKids: () => [], but SimpleTextSelection generates its
  // CapaProblem (and its grader/input subtree) dynamically in postprocess.
  // Without this, collectBlockWithKids won't ship the generated CapaProblem and
  // the client render fails with "Block <id>_problem not found in content".
  // Mirrors SimpleSortable/MarkupProblem; the generated CapaProblem's own
  // staticKids recurses the rest of the subtree.
  staticKids: directKidIds,
});

export default SimpleTextSelection;
