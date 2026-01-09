// src/components/blocks/grading/NumericalGrader.ts
//
// Grader for numeric answers with tolerance for rounding and formatting variations.
//
// The pure match function `numericalMatch` is also exported for use in DSL expressions:
//   numericalMatch(@answer.value, 42, { tolerance: 0.1 })
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { numericalMatch, validateNumericalAttributes } from '@/lib/util/numeric';

const NumericalGrader = createGrader({
  base: 'Numerical',
  description: 'Grades numeric answers with tolerance for rounding and formatting variations',
  match: numericalMatch,
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
    tolerance: z.string().optional(),
  },
  validateAttributes: validateNumericalAttributes,
});

export default NumericalGrader;
