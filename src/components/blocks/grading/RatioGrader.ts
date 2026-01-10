// src/components/blocks/grading/RatioGrader.ts
//
// Grader for ratio and fraction answers.
//
// Usage:
//   <RatioGrader answer="0.5">
//     <LineInput id="numerator" />
//     <LineInput id="denominator" />
//   </RatioGrader>
//
// The pure match function `ratioMatch` is available in DSL expressions:
//   ratioMatch([@num.value, @denom.value], '0.5')
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { ratioMatch, validateRatioInputs, validateNumericalAttributes } from '@/lib/util/numeric';

// Re-export for convenience
export { ratioMatch } from '@/lib/util/numeric';

const RatioGrader = createGrader({
  base: 'Ratio',
  description: 'Grades ratio and fraction answers, comparing the ratio between two inputs',
  match: ratioMatch,
  inputSchema: z.tuple([z.string(), z.string()]),  // Two string inputs: [numerator, denominator]
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
    tolerance: z.string().optional(),
  },
  validateAttributes: validateNumericalAttributes,
  validateInputs: validateRatioInputs,
});

export default RatioGrader;
