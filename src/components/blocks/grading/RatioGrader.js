// src/components/blocks/grading/RatioGrader.js
//
// Grader for ratio and fraction answers.
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { gradeRatio } from '@/lib/util/numeric.js';

const RatioGrader = createGrader({
  base: 'Ratio',
  description: 'Grades ratio and fraction answers, comparing the ratio between two inputs',
  grader: gradeRatio,
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
    tolerance: z.string().optional(),
  },
});

export default RatioGrader;
