// packages/shared/components/blocks/language-arts/TextSelection/TextSelectionGrader.ts
//
// Grader half of the TextSelection family. Scores a stored selection (array of
// word indices) from a sibling/child TextSelectionInput against the answer key
// marked in that input's passage. Sync and immediate-capable.
//
// The answer key and scoring rules come from the INPUT, through its
// `getExpectedSelections` local — one tokenization, owned by the input. This
// grader never re-tokenizes; it consumes segment-level facts and the shared
// scoring model. That keeps grading working from Block + state + static DOM,
// with no rendered tree (the static-grader-topology doctrine).
//
import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { graderInputStateKeys } from '@/lib/grading/topology';
import { scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import * as state from '@/lib/state';
import { resolveTarget } from '@/lib/state';
import { correctness, type Correctness } from '@/lib/grading/correctness';
import {
  computeStats, scoreFromStats, messageForStats, displayAnswerFromExpected,
  type ExpectedSelections,
} from './textSelectionModel';

export const fields = state.fields(state.graderFields());

function gradeSelection(props, { input, inputApi }) {
  const selected = new Set<number>(Array.isArray(input) ? input : []);
  const expected = inputApi.getExpectedSelections() as ExpectedSelections;

  const stats = computeStats(selected, expected);

  // No marked answers → free selection; there is nothing to grade.
  if (stats.totalRequired === 0) return { correct: correctness.unsubmitted, message: '' };
  // Nothing selected yet → not an answer (keeps immediate mode from flashing red).
  if (selected.size === 0) return { correct: correctness.unsubmitted, message: '' };

  const score = scoreFromStats(stats);
  const message = messageForStats(stats, expected.scoring);

  let correct: Correctness;
  if (stats.complete) correct = correctness.correct;
  else if (score > 0) correct = correctness.partiallyCorrect;
  else correct = correctness.incorrect;

  return { correct, message, score };
}

/**
 * The required phrases to reveal on Show Answer. Discovered from the STATIC DOM
 * (graderInputStateKeys), exactly as KeyGrader/CheckboxGrader do — the grader's
 * props come from staticTargetProps, so dynamic-DOM discovery is neither
 * available nor correct here.
 */
function getSelectionDisplayAnswer(props) {
  if (props.displayAnswer != null) return props.displayAnswer;
  if (props.answer != null) return props.answer;

  const reduxState = props.runtime.store.getState();
  const inputIds = graderInputStateKeys(reduxState, props, scopedStateKeyForBlock(props));
  if (inputIds.length === 0) {
    throw new Error(`TextSelectionGrader "${props.id}": No input found. Nest a TextSelectionInput inside, or add target="inputId".`);
  }

  // Resolve the input's OWN props — never spread this grader's props into them:
  // the auto-wired target= would leak in and getExpectedSelections would follow
  // it back to the grader instead of the input.
  const inputStateKey = inputIds[0];
  const input = resolveTarget(reduxState, props, inputStateKey);
  if (!input) {
    throw new Error(`TextSelectionGrader "${props.id}": Input "${inputStateKey}" not found. Check the target attribute.`);
  }
  const expected = input.loBlock.locals.getExpectedSelections(input.targetProps) as ExpectedSelections;
  return displayAnswerFromExpected(expected);
}

const TextSelectionGrader = blocks.test({
  ...parsers.blocks.allowHTML(),
  ...blocks.grader({ grader: gradeSelection }),
  name: 'TextSelectionGrader',
  category: 'grading',
  description: 'Grades a TextSelectionInput: required phrases earn credit, plain-text and decoy (<<...>>) selections subtract. Partial credit by default; authored scoring rules drive the feedback message.',
  componentLoader: () => import('@/components/blocks/grading/_GraderShell').then(m => m.default),
  fields,
  getDisplayAnswer: getSelectionDisplayAnswer,
  inputSchema: z.array(z.number()),
});

export default TextSelectionGrader;
