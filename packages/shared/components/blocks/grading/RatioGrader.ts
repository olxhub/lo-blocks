// src/components/blocks/grading/RatioGrader.ts
//
// Grader for ratio and fraction answers.
//
// Usage:
//   <RatioGrader answer="0.5">
//     <NumberInput />  <!-- numerator (by position) -->
//     <NumberInput />  <!-- denominator (by position) -->
//   </RatioGrader>
//
// Or with explicit slots:
//   <RatioGrader answer="0.5">
//     <NumberInput slot="denominator" />
//     <NumberInput slot="numerator" />
//   </RatioGrader>
//
// The pure match function `ratioMatch` is available in DSL expressions:
//   ratioMatch({ numerator: 2, denominator: 4 }, '0.5')
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
  slots: ['numerator', 'denominator'],  // Named input slots
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
    tolerance: z.string().optional(),
    displayAnswer: z.string().optional(),  // e.g., "2:1" for display
  },
  validateAttributes: validateNumericalAttributes,
  validateInputs: validateRatioInputs,
  answerDisplayMode: 'per-input',
  // Show answer next to numerator only (not both inputs)
  getDisplayAnswers: (props) => ({
    numerator: props.displayAnswer ?? props.answer,
  }),
});

export default RatioGrader;
