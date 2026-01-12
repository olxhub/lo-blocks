// src/components/blocks/TextHighlight/TextHighlight.js
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as blocks from '@/lib/blocks';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import * as parser from './_textHighlightParser';
import _TextHighlight from './_TextHighlight';

export const fields = state.fields([
  commonFields.value,      // Set of selected word indices
  'attempts',              // Number of check attempts
  'feedback',              // Current feedback message
  commonFields.showAnswer, // Whether answer is revealed (self_check mode)
  'checked',               // Whether graded mode has been checked
  'score'                  // Current score
]);

const TextHighlight = core({
  ...peggyParser(parser),
  ...blocks.input({
    getValue: (props, state, id) => {
      const selections = fieldSelector(state, props, fields.value, { fallback: [], id });
      const attempts = fieldSelector(state, props, fields.attempts, { fallback: 0, id });
      const score = fieldSelector(state, props, fields.score, { fallback: 0, id });
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
  name: 'TextHighlight',
  description: 'Interactive text highlighting exercise with feedback',
  component: _TextHighlight,
  fields,
  // Uses grader mixin attributes; content defined by PEG syntax
});

export default TextHighlight;