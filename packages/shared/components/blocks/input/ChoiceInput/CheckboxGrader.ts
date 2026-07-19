// packages/shared/components/blocks/input/ChoiceInput/CheckboxGrader.ts
//
// Grader for multi-select (checkbox) questions.
// For single-select (radio button) questions, use KeyGrader instead.
//
// Supports two grading modes:
// - All-or-nothing (default): all Keys must be selected, no Distractors
// - Partial credit (partialCredit="true"): score = (keysSelected - distractorsSelected) / totalKeys
//
import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { graderInputStateKeys } from '@/lib/grading/topology';
import { scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import * as state from '@/lib/state';
import { resolveTarget } from '@/lib/state';
import { correctness } from '@/lib/blocks/correctness';

export const fields = state.fields(state.graderFields());

/**
 * Grade multi-select (checkbox) choice.
 *
 * @param {string[]} selected - Array of selected values
 * @param {Array<{tag: string, value: string}>} choices - All choices
 * @param {Object} options - Grading options
 * @param {boolean} options.partialCredit - If true, award partial credit (n/m scoring)
 * @returns {{correct: string, message: string, score?: number}}
 */
function gradeCheckboxes(selected, choices, options: { partialCredit?: boolean } = {}) {
  const { partialCredit = false } = options;
  const selectedSet = new Set(Array.isArray(selected) ? selected : []);
  const keys = choices.filter(c => c.tag === 'Key');
  const distractors = choices.filter(c => c.tag === 'Distractor');

  // Count correct and incorrect selections
  const keysSelected = keys.filter(k => selectedSet.has(k.value)).length;
  const distractorsSelected = distractors.filter(d => selectedSet.has(d.value)).length;

  const allKeysSelected = keysSelected === keys.length;
  const noDistractorsSelected = distractorsSelected === 0;

  // All-or-nothing: must select all keys and no distractors
  if (allKeysSelected && noDistractorsSelected) {
    return { correct: correctness.correct, message: '', score: 1 };
  }

  if (!partialCredit) {
    // All-or-nothing mode: anything less than perfect is incorrect
    return { correct: correctness.incorrect, message: '', score: 0 };
  }

  // Partial credit mode: score = (keysSelected - distractorsSelected) / totalKeys
  // Clamped to [0, 1] range
  const totalKeys = keys.length;
  if (totalKeys === 0) {
    // Edge case: no keys defined
    return { correct: correctness.incorrect, message: '', score: 0 };
  }

  const rawScore = (keysSelected - distractorsSelected) / totalKeys;
  const score = Math.max(0, Math.min(1, rawScore));

  if (score === 0) {
    return { correct: correctness.incorrect, message: '', score };
  } else if (score === 1) {
    return { correct: correctness.correct, message: '', score };
  } else {
    return { correct: correctness.partiallyCorrect, message: `${keysSelected}/${totalKeys} correct`, score };
  }
}

function gradeCheckboxSelected(props, { input, inputApi }) {
  const selected = input ?? [];
  const choices = inputApi.getChoices();
  const partialCredit = props.partialCredit === true || props.partialCredit === 'true';
  return gradeCheckboxes(selected, choices, { partialCredit });
}

/**
 * Find all correct answer values by looking for Key choices.
 * Returns an array of values.
 */
function getCheckboxDisplayAnswer(props) {
  if (props.displayAnswer != null) return props.displayAnswer;
  if (props.answer != null) return props.answer;

  // TODO: This grader logic should move to /lib/blocks/. Components shouldn't access
  // blockRegistry and construct props - that's infrastructure logic.
  //
  // Which input does this grader grade? Answered once, from the STATIC DOM
  // (graderInputStateKeys) — the same discovery grading itself uses. The
  // grader's props come from staticTargetProps (nodeInfo undefined by
  // design), so dynamic-DOM discovery is neither available nor correct here.
  const reduxState = props.runtime.store.getState();
  const inputIds = graderInputStateKeys(reduxState, props, scopedStateKeyForBlock(props));
  if (inputIds.length === 0) {
    throw new Error(`CheckboxGrader "${props.id}": No input found. Nest a CheckboxInput inside, or add target="inputId".`);
  }

  // Resolve the input's OWN props — never spread this grader's props into
  // them: the grader's auto-wired target= would leak in, and getChoices would
  // follow it back to the input itself, silently returning zero Keys.
  const inputStateKey = inputIds[0];
  const input = resolveTarget(reduxState, props, inputStateKey);
  if (!input) {
    throw new Error(`CheckboxGrader "${props.id}": Input "${inputStateKey}" not found. Check the target attribute.`);
  }
  const choices = input.loBlock.locals.getChoices(input.targetProps);
  const keyChoices = choices.filter(c => c.tag === 'Key');
  return keyChoices.map(k => k.value);
}

// CheckboxGrader-specific attributes (merged with base + graderMixin at factory time).
// Keep this exported so MarkupProblem can construct typed attribute literals.
export const checkboxGraderAttributes = z.object({
  partialCredit: z.enum(['true', 'false']).optional().describe('Enable partial credit scoring (n/m formula)'),
}).strict();

const CheckboxGrader = blocks.test({
  ...parsers.blocks.allowHTML(),
  ...blocks.grader({ grader: gradeCheckboxSelected }),
  name: 'CheckboxGrader',
  description: 'Grades checkbox selections - all Keys must be selected and no Distractors. Use partialCredit="true" for n/m scoring.',
  category: 'grading',
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  fields,
  getDisplayAnswer: getCheckboxDisplayAnswer,
  inputSchema: z.array(z.string()),
  attributes: checkboxGraderAttributes,
});

export default CheckboxGrader;
