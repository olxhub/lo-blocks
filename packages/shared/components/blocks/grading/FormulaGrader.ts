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
import { checkFormula, validateSamplesSpec } from '@/lib/util/calc/grader.js';
import { evaluator, parse, collectIdentifiers, DEFAULT_VARIABLES, DEFAULT_FUNCTIONS } from '@/lib/util/calc/index.js';

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
  options?: { samples?: string; tolerance?: string; caseSensitive?: string | boolean; additionalAnswers?: string },
): boolean {
  const samples = options?.samples;
  if (!samples) {
    throw new Error('FormulaGrader requires a "samples" attribute (e.g. "x@-5:5#10")');
  }
  const evalOpts = {
    tolerance: options?.tolerance ? parseFloat(options.tolerance) : undefined,
    caseSensitive: options?.caseSensitive === true || options?.caseSensitive === 'true',
  };

  // Collect all accepted answers (primary + additional)
  const answers = [answer];
  if (options?.additionalAnswers) {
    answers.push(...options.additionalAnswers.split(';').map(s => s.trim()).filter(Boolean));
  }

  for (const ans of answers) {
    const result = checkFormula(ans, input, samples, evalOpts);
    if (result.correct) return true;
    // If this answer errored (e.g. bad formula), skip and try next
  }
  return false;
}

/** Names that are built-in and don't need to appear in a samples spec. */
const BUILTIN_NAMES = new Set([
  ...Object.keys(DEFAULT_VARIABLES),
  ...Object.keys(DEFAULT_FUNCTIONS),
]);

/**
 * Validate FormulaGrader attributes at parse time.
 *
 * Provides detailed, teacher-friendly error messages including:
 * - Answer formula syntax checking
 * - Concrete samples suggestions when samples is missing
 * - Structural validation of samples format
 * - Cross-validation of answer variables vs sample variables
 * - Test evaluation of the answer at a sample point
 */
function validateFormulaAttributes(attrs: Record<string, any>): string[] | undefined {
  const errors: string[] = [];

  // --- Validate tolerance ---
  if (attrs.tolerance !== undefined && attrs.tolerance !== '') {
    const tol = parseFloat(String(attrs.tolerance));
    if (isNaN(tol) || tol < 0) {
      errors.push(`tolerance: "${attrs.tolerance}" is not a valid non-negative number.`);
    }
  }

  // --- Validate answer formula parses ---
  let answerAST: any = null;
  let answerVars: Set<string> = new Set();
  if (attrs.answer) {
    try {
      answerAST = parse(String(attrs.answer));
      const ids = collectIdentifiers(answerAST);
      // User variables = identifiers that aren't built-in constants/functions
      answerVars = new Set([...ids.variables].filter(v => !BUILTIN_NAMES.has(v.toLowerCase())));
    } catch (e: any) {
      errors.push(`answer: Could not parse "${attrs.answer}" as a math expression. Check for missing operands or unmatched parentheses.`);
      return errors;  // Can't do further checks without a valid answer
    }
  }

  // --- Validate samples ---
  if (!attrs.samples) {
    // samples is declared optional in Zod so that this validator runs instead
    // of Zod's generic required_error. This lets us inspect the answer formula
    // and generate a concrete, copy-pasteable example.
    if (answerVars.size > 0) {
      const varList = [...answerVars];
      const varNames = varList.join(',');
      const mins = varList.map(() => '0').join(',');
      const maxs = varList.map(() => '1').join(',');
      const example = `${varNames}@${mins}:${maxs}#10`;
      const breakdown = varList.map(v => `  - Sample ${v} from 0 to 1`).join('\n');

      errors.push(
        `samples is required. Your answer uses variables: ${varList.join(', ')}\n\n` +
        `The samples attribute tells the grader what values to test. For example:\n\n` +
        `  samples="${example}"\n\n` +
        `This means:\n` +
        `${breakdown}\n` +
        `  - Test 10 random points\n\n` +
        `Choose ranges where your formula produces finite values.`
      );
    } else {
      errors.push('samples is required (e.g. "x@-5:5#10").');
    }
    return errors;
  }

  // --- Validate samples format ---
  const { parsed: sampleSpec, errors: sampleErrors } = validateSamplesSpec(String(attrs.samples));
  if (sampleErrors.length > 0) {
    errors.push(...sampleErrors);
    return errors;  // Can't cross-validate without valid samples
  }

  // --- Cross-validate answer variables vs sample variables ---
  if (sampleSpec && answerVars.size > 0) {
    const sampleVarSet = new Set(sampleSpec.variables);

    for (const v of answerVars) {
      if (!sampleVarSet.has(v)) {
        errors.push(
          `samples: Your answer uses variable "${v}" but it is not listed in the samples spec. ` +
          `The grader won't know what values to test for it.`
        );
      }
    }

    for (const v of sampleSpec.variables) {
      if (!answerVars.has(v) && !BUILTIN_NAMES.has(v.toLowerCase())) {
        errors.push(
          `samples: Variable "${v}" is listed in samples but does not appear in the answer formula. ` +
          `This is allowed but may indicate a typo.`
        );
      }
    }
  }

  // --- Test-evaluate the answer at a sample midpoint ---
  if (sampleSpec && answerAST && errors.length === 0) {
    const testVars: Record<string, number> = {};
    const parts: string[] = [];
    for (const v of sampleSpec.variables) {
      const [lo, hi] = sampleSpec.ranges[v];
      const mid = (lo + hi) / 2;
      testVars[v] = mid;
      parts.push(`${v}=${mid}`);
    }
    const caseSensitive = attrs.caseSensitive === 'true' || attrs.caseSensitive === true;
    try {
      evaluator(testVars, {}, String(attrs.answer), { caseSensitive });
    } catch (e: any) {
      errors.push(
        `answer: Formula evaluation failed with sample values {${parts.join(', ')}}: ${e.message}\n` +
        `Check that your formula is valid in the sampled range.`
      );
    }

    // --- Validate additional answers ---
    if (attrs.additionalAnswers) {
      const extras = String(attrs.additionalAnswers).split(';').map(s => s.trim()).filter(Boolean);
      for (const extra of extras) {
        try {
          parse(extra);
        } catch {
          errors.push(`additionalAnswers: Could not parse "${extra}" as a math expression.`);
          continue;
        }
        try {
          evaluator(testVars, {}, extra, { caseSensitive });
        } catch (e: any) {
          errors.push(
            `additionalAnswers: "${extra}" failed with sample values {${parts.join(', ')}}: ${e.message}`
          );
        }
      }
    }
  }

  return errors.length > 0 ? errors : undefined;
}

/**
 * Validate that the student's input is a parseable math expression.
 *
 * When the grader has a samples spec, also checks that the student only uses
 * variables from the samples spec (plus built-ins). This catches typos like
 * "X" when only "x" is allowed, before grading runs.
 *
 * Variable checking can be disabled with checkVariables="false" on the grader.
 */
function validateFormulaInput(input: any, attrs: Record<string, any>): string[] | undefined {
  if (typeof input !== 'string') return ['Expected a string'];

  // Build the allowed variable set from the samples spec
  const shouldCheckVars = attrs.checkVariables !== 'false' && attrs.samples;
  let allowedVars: Record<string, number> = {};
  if (shouldCheckVars) {
    const { parsed } = validateSamplesSpec(String(attrs.samples));
    if (parsed) {
      for (const v of parsed.variables) {
        allowedVars[v] = 0; // value doesn't matter, just need the key
      }
    }
  }

  const caseSensitive = attrs.caseSensitive === 'true' || attrs.caseSensitive === true;

  try {
    evaluator(allowedVars, {}, input, { caseSensitive });
  } catch (e: any) {
    if (e.name === 'UndefinedVariable') {
      // If we're checking variables, this is a real error — the student used
      // a variable not in the samples spec.
      if (shouldCheckVars) {
        return [e.message];
      }
      // Not checking variables — just means it parsed OK with unknown vars
      return undefined;
    }
    if (e.name === 'UnmatchedParenthesis') return [e.message];
    if (e.name === 'SyntaxError') return [e.message]; // now has friendly message
    // Other errors (like ZeroDivisionError from e.g. "1/0") mean it parsed fine
    if (e.name === 'ZeroDivisionError') return undefined;
    if (e.name === 'ValueError') return undefined;
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
    // Optional in Zod so our validateFormulaAttributes runs instead of Zod's
    // generic required_error. This lets us inspect the answer formula and
    // generate a concrete, copy-pasteable samples example.
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
