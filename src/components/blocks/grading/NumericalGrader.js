// src/components/blocks/NumericalGrader.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { baseAttributes } from '@/lib/blocks';
import _Noop from '@/components/blocks/layout/_Noop';
import * as state from '@/lib/state';
import { gradeNumerical } from '@/lib/util/numeric.js';
import { z } from 'zod';

export const fields = state.fields(['correct', 'message']);

const NumericalGrader = blocks.test({
  ...parsers.blocks(),
  ...blocks.grader({
    grader: gradeNumerical,
  }),
  name: 'NumericalGrader',
  description: 'Grades numeric answers with tolerance for rounding and formatting variations',
  component: _Noop,
  attributeSchema: baseAttributes.extend({
    answer: z.string({ required_error: 'answer is required' }),
    target: z.string().optional(),
    tolerance: z.string().optional(),
  }),
  fields,
});

export default NumericalGrader;
