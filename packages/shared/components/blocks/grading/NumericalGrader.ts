// packages/shared/components/blocks/grading/NumericalGrader.ts
//
// Grader for numeric answers with tolerance for rounding and formatting variations.
//
// The pure match function `numericalMatch` is also exported for use in DSL expressions:
//   numericalMatch(@answer.value, 42, { tolerance: 0.1 })
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { numericalMatch, validateNumericalInput, validateNumericalAttributes } from '@/lib/grading';
import { ToleranceSchema } from '@/lib/util/calc/index.js';

const NumericalGrader = createGrader({
  base: 'Numerical',
  description: 'Grades numeric answers with tolerance for rounding and formatting variations',
  match: numericalMatch,
  inputSchema: z.string(),  // Single string input
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
    tolerance: ToleranceSchema.optional(),
  },
  validateAttributes: validateNumericalAttributes,
  validateInputs: validateNumericalInput,
});

export default NumericalGrader;
