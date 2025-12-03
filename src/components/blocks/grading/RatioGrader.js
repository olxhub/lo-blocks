// src/components/blocks/RatioGrader.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { baseAttributes } from '@/lib/blocks';
import _Noop from '@/components/blocks/layout/_Noop';
import * as state from '@/lib/state';
import { gradeRatio } from '@/lib/util/numeric.js';
import { z } from 'zod';

export const fields = state.fields(['correct', 'message']);

const RatioGrader = blocks.test({
  ...parsers.blocks(),
  ...blocks.grader({
    grader: gradeRatio,
  }),
  name: 'RatioGrader',
  description: 'Grades ratio and fraction answers, comparing the ratio between two inputs',
  component: _Noop,
  attributeSchema: baseAttributes.extend({
    answer: z.string({ required_error: 'answer is required' }),
    target: z.string().optional(),
    tolerance: z.string().optional(),
  }),
  fields,
});

export default RatioGrader;

