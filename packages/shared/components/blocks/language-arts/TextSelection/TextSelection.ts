// src/components/blocks/TextSelection/TextSelection.ts
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as blocks from '@/lib/blocks';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import * as parser from './_textSelectionParser';
import _TextSelection from './_TextSelection';

export const fields = state.fields([
  commonFields.value,      // Set of selected word indices
  state.graderFields(),    // correct, message, score, lastSubmission, submitCount, showAnswer
  'attempts',              // Number of check attempts
  'feedback',              // Current feedback message
  'checked',               // Whether graded mode has been checked
]);

const TextSelection = core({
  ...peggyParser(parser),
  ...blocks.input({
    selectValue: (props, state, _reduxKey) => {
      const selections = fieldSelector(state, props, fields.value, { fallback: [] });
      const attempts = fieldSelector(state, props, fields.attempts, { fallback: 0 });
      const score = fieldSelector(state, props, fields.score, { fallback: 0 });
      return { selections, attempts, score };
    }
  }),
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
  description: 'Interactive text highlighting exercise with feedback',
  component: _TextSelection,
  fields,
  // Uses grader mixin attributes; content defined by PEG syntax
});

export default TextSelection;