// src/components/blocks/grading/NumericalGrader.js
//
// Grader for numeric answers with tolerance for rounding and formatting variations.
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { gradeNumerical } from '@/lib/util/numeric.js';

const NumericalGrader = createGrader({
  base: 'Numerical',
  description: 'Grades numeric answers with tolerance for rounding and formatting variations',
  grader: gradeNumerical,
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
    tolerance: z.string().optional(),
  },
});

export default NumericalGrader;
