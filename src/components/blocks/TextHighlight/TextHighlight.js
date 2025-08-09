// src/components/blocks/TextHighlight/TextHighlight.js
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as blocks from '@/lib/blocks';
import { peggyParser } from '@/lib/content/parsers';
import * as parserModule from './_textHighlightParser.js';
const parser = parserModule.default || parserModule;
import _TextHighlight from './_TextHighlight';

export const fields = state.fields([
  { name: 'value', scope: 'component' },      // Set of selected word indices  
  { name: 'attempts', scope: 'component' },   // Number of check attempts
  { name: 'feedback', scope: 'component' },   // Current feedback message
  { name: 'showAnswer', scope: 'component' }, // Whether answer is revealed (self_check mode)
  { name: 'checked', scope: 'component' }     // Whether graded mode has been checked
]);

const TextHighlight = core({
  ...peggyParser(parser),
  ...blocks.input({
    getValue: (redux, id) => {
      const selections = redux?.[id]?.value || [];
      const attempts = redux?.[id]?.attempts || 0;
      const correct = redux?.[id]?.correct;
      return { selections, attempts, correct };
    }
  }),
  ...blocks.grader({
    grader: (props, { input }) => {
      // This would be called by an ActionButton
      // The actual grading logic is in the component
      return input?.correct || blocks.CORRECTNESS.UNGRADED;
    }
  }),
  name: 'TextHighlight',
  description: 'Interactive text highlighting exercise with feedback',
  component: _TextHighlight,
  fields
});

export default TextHighlight;