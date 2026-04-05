// packages/shared/components/blocks/grading/FormulaGrader.ts
//
// Sampling-based formula equivalence grader.
//
// The pure match function `formulaMatch` is also exported for use in DSL expressions:
//   formulaMatch(@answer.value, "x^2", { samples: "x@-5:5#10" })
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { formulaMatch, validateFormulaAttributes, validateFormulaInput } from '@/lib/grading';

const FormulaGrader = createGrader({
  base: 'Formula',
  description: 'Grades math formulas by sampling-based equivalence (e.g. x^2-1 vs (x-1)(x+1))',
  match: formulaMatch,
  inputSchema: z.string(),
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
    // Optional in Zod so validateFormulaAttributes can inspect the answer formula
    // and generate a concrete, copy-pasteable samples example.
    samples: z.string().optional(),
    tolerance: z.string().optional(),
    caseSensitive: z.string().optional(),
    additionalAnswers: z.string().optional().describe('Semicolon-separated alternative correct formulas'),
    checkVariables: z.string().optional().describe('Set to "false" to allow any variable names in student input'),
  },
  validateAttributes: validateFormulaAttributes,
  validateInputs: validateFormulaInput,
});

export default FormulaGrader;
