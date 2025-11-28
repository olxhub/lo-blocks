// src/components/blocks/DigitSpanTask/DigitSpanTask.jsx
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';

import { _DigitSpanTask } from './_DigitSpanTask';

const description = 'Working memory assessment where participants recall spoken digit sequences';

export const fields = state.fields([
  'sequence',
  'userInput',
  'step',
  'theta',
  'difficulty'
]);

const DigitSpanTask = dev({
  ...parsers.ignore(),
  name: 'DigitSpanTask',
  component: _DigitSpanTask,
  description,
  fields
});

export default DigitSpanTask;
