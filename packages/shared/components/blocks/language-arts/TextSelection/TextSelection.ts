// packages/shared/components/blocks/language-arts/TextSelection/TextSelection.ts
import { z } from 'zod';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, decodedFieldSelector, commonFields } from '@/lib/state';
import * as blocks from '@/lib/blocks';
import { peggyParser } from '@/lib/content/parsers';
import * as parser from './_textSelectionParser';
import { shallowEqual } from 'react-redux';

export const fields = state.fields([
  commonFields.value,      // Set of selected word indices
  state.graderFields(),    // correct, message, score, lastSubmission, submitCount, showAnswer
  'attempts',              // Number of check attempts
  'feedback',              // Current feedback message
  'checked',               // Whether graded mode has been checked
]);

const TextSelection = test({
  ...peggyParser(parser),
  ...blocks.input({
  }),
  selectors: {
    value: {
      select: (state, props, _stateKey) => {
        const selections = decodedFieldSelector(state, props, fields.value, { fallback: [] });
        const attempts = fieldSelector(state, props, fields.attempts, { fallback: 0 });
        const score = fieldSelector(state, props, fields.score, { fallback: 0 });
        return { selections, attempts, score };
      },
      // Fresh object per evaluation — subscribers gate on content.
      equality: shallowEqual,
    },
  },
  ...blocks.grader({
    grader: (props, params) => {
      const { input } = params as { input: any };
      // This would be called by an ActionButton
      // The actual grading logic is in the component
      return input?.correct || blocks.correctness.unsubmitted;
    },
    inputType: 'single',
  }),
  name: 'TextSelection',
  category: 'language-arts',
  description: 'Prototype text highlighting exercise. Works for wireframing courses; scoring and feedback rules are placeholders pending integration with the expression language and Capa grading system.',
  fields,
  attributes: z.object({
    mode: z.enum(['immediate', 'graded', 'selfcheck']).optional()
      .describe('Interaction mode: "immediate" (live feedback), "graded" (check button), or "selfcheck" (reveal answer)'),
    showRealtimeFeedback: z.coerce.boolean().optional()
      .describe('In immediate mode, color selections green/red as the student selects (default: false)'),
  }).strict(),
});

export default TextSelection;