// src/components/blocks/grading/FormulaGrader.ts
//
// Sampling-based formula equivalence grader.
// Evaluates student and instructor formulas at random points to check equivalence.
//
// The pure match function `formulaMatch` is also exported for use in DSL expressions:
//   formulaMatch(@answer.value, "x^2", { samples: "x@-5:5#10" })
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { checkFormula, parseSamples } from '@/lib/util/calc/grader.js';
import { evaluator } from '@/lib/util/calc/index.js';

/**
 * Pure formula matching function (boolean predicate).
 *
 * Compares a student formula against an expected formula by evaluating
 * both at random sample points and checking equality within tolerance.
 *
 * @param input - The student's formula string
 * @param answer - The expected formula string
 * @param options - { samples, tolerance?, caseSensitive? }
 * @returns true if formulas are equivalent within tolerance
 */
export function formulaMatch(
  input: string,
  answer: string,
  options?: { samples?: string; tolerance?: string; caseSensitive?: string | boolean },
): boolean {
  const samples = options?.samples;
  if (!samples) {
    throw new Error('FormulaGrader requires a "samples" attribute (e.g. "x@-5:5#10")');
  }
  const result = checkFormula(answer, input, samples, {
    tolerance: options?.tolerance ? parseFloat(options.tolerance) : undefined,
    caseSensitive: options?.caseSensitive === true || options?.caseSensitive === 'true',
  });
  if (result.error) throw new Error(result.error);
  return result.correct;
}

/**
 * Validate FormulaGrader attributes at parse time.
 */
function validateFormulaAttributes(attrs: Record<string, any>): string[] | undefined {
  const errors: string[] = [];

  if (attrs.samples) {
    try {
      parseSamples(String(attrs.samples));
    } catch (e: any) {
      errors.push(`samples: Invalid format "${attrs.samples}". Expected format like "x@-5:5#10" or "x,y@-5,-5:5,5#10".`);
    }
  }

  if (attrs.tolerance !== undefined && attrs.tolerance !== '') {
    const tol = parseFloat(String(attrs.tolerance));
    if (isNaN(tol) || tol < 0) {
      errors.push(`tolerance: "${attrs.tolerance}" is not a valid non-negative number.`);
    }
  }

  return errors.length > 0 ? errors : undefined;
}

/**
 * Validate that the student's input is a parseable math expression.
 */
function validateFormulaInput(input: any): string[] | undefined {
  if (typeof input !== 'string') return ['Expected a string'];
  try {
    // Try to parse the expression (with no variables — just syntax check)
    // We use evaluator with empty vars; if it throws UndefinedVariable that's fine
    // (means it parsed OK but has variables, which is expected).
    // Only syntax errors should fail.
    evaluator({}, {}, input);
  } catch (e: any) {
    if (e.name === 'UndefinedVariable') return undefined; // parsed OK, just has variables
    if (e.name === 'UnmatchedParenthesis') return [e.message];
    if (e.name === 'SyntaxError') return ['Invalid expression syntax'];
    // Other errors (like ZeroDivisionError from e.g. "1/0") mean it parsed fine
    if (e.name === 'ZeroDivisionError') return undefined;
    return [e.message || 'Invalid expression'];
  }
  return undefined;
}

const FormulaGrader = createGrader({
  base: 'Formula',
  description: 'Grades math formulas by sampling-based equivalence (e.g. x^2-1 vs (x-1)(x+1))',
  match: formulaMatch,
  inputSchema: z.string(),
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
    samples: z.string({ required_error: 'samples is required (e.g. "x@-5:5#10")' }),
    tolerance: z.string().optional(),
    caseSensitive: z.string().optional(),
  },
  validateAttributes: validateFormulaAttributes,
  validateInputs: validateFormulaInput,
});

export default FormulaGrader;
