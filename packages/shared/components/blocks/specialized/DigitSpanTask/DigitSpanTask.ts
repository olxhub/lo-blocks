// src/components/blocks/DigitSpanTask/DigitSpanTask.jsx
import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
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
  fields,
  attributes: baseAttributes.extend({
    mode: z.enum(['forward', 'backward', 'ascending']).optional().describe('Recall mode (default: forward)'),
  }),
});

export default DigitSpanTask;
