// packages/shared/lib/grading/formula.ts — Thin glue: maps grader framework ↔ calc/ for formula grading.
//
// Match function is a pure predicate. Validators compose calc/ primitives.

import {
  validateSamplesSpec,
  validateTolerance,
  parseTolerance,
  BUILTIN_VARIABLE_NAMES,
  BUILTIN_FUNCTION_NAMES,
  type Tolerance,
} from '@/lib/util/calc/schemas';
import { requireCalc } from './calcLoader';
import type { SamplesSpec, CalcASTNode } from '@/lib/util/calc/types';


/** Names that are built-in and don't need to appear in a samples spec.
 *  From the mathjs-free contract lists — functions.js asserts they match
 *  the real implementations. */
const BUILTIN_NAMES = new Set<string>([
  ...BUILTIN_VARIABLE_NAMES,
  ...BUILTIN_FUNCTION_NAMES,
]);

export interface FormulaMatchOptions {
  samples?: string | SamplesSpec;
  tolerance?: Tolerance;
  caseSensitive?: string | boolean;
  additionalAnswers?: string;
}

/**
 * Pure formula matching function (boolean predicate).
 *
 * Compares a student formula against an expected formula by evaluating
 * both at random sample points and checking equality within tolerance.
 */
export function formulaMatch(
  input: string,
  answer: string,
  options?: FormulaMatchOptions,
): boolean {
  const samples = options?.samples;
  if (!samples) {
    throw new Error('FormulaGrader requires a "samples" attribute (e.g. "x@-5:5#10")');
  }
  // parseTolerance with base=1: "5%" → 0.05 (ratio for compareRelative)
  const tolerance = options?.tolerance ? parseTolerance(options.tolerance, 1) : undefined;
  const evalOpts = {
    tolerance,
    caseSensitive: options?.caseSensitive === true || options?.caseSensitive === 'true',
  };

  const answers = [answer];
  if (options?.additionalAnswers) {
    answers.push(...options.additionalAnswers.split(';').map(s => s.trim()).filter(Boolean));
  }

  for (const ans of answers) {
    const result = requireCalc().checkFormula(ans, input, samples, evalOpts);
    if (result.correct) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// Attribute Validation (parse-time, teacher-facing)
// ═══════════════════════════════════════════════════════════════════════

function validateAnswerFormula(answer: string): { ast: CalcASTNode; vars: Set<string> } | string {
  try {
    const ast = requireCalc().parse(answer);
    const ids = requireCalc().collectIdentifiers(ast);
    const vars = new Set([...ids.variables].filter(v => !BUILTIN_NAMES.has(v.toLowerCase())));
    return { ast, vars };
  } catch {
    return `answer: Could not parse "${answer}" as a math expression. Check for missing operands or unmatched parentheses.`;
  }
}

function suggestSamplesSpec(answerVars: Set<string>): string {
  if (answerVars.size === 0) {
    return 'samples is required (e.g. "x@-5:5#10").';
  }
  const varList = [...answerVars];
  const varNames = varList.join(',');
  const mins = varList.map(() => '0').join(',');
  const maxs = varList.map(() => '1').join(',');
  const example = `${varNames}@${mins}:${maxs}#10`;
  const breakdown = varList.map(v => `  - Sample ${v} from 0 to 1`).join('\n');
  return (
    `samples is required. Your answer uses variables: ${varList.join(', ')}\n\n` +
    `The samples attribute tells the grader what values to test. For example:\n\n` +
    `  samples="${example}"\n\n` +
    `This means:\n` +
    `${breakdown}\n` +
    `  - Test 10 random points\n\n` +
    `Choose ranges where your formula produces finite values.`
  );
}

function crossValidateVariablesAndSamples(
  answerVars: Set<string>,
  sampleSpec: SamplesSpec,
  caseSensitive: boolean,
): string[] {
  const errors: string[] = [];
  const casify = caseSensitive ? (x: string) => x : (x: string) => x.toLowerCase();
  const sampleVarSet = new Set(sampleSpec.variables.map(casify));

  for (const v of answerVars) {
    if (!sampleVarSet.has(casify(v))) {
      errors.push(
        `samples: Your answer uses variable "${v}" but it is not listed in the samples spec. ` +
        `The grader won't know what values to test for it.`
      );
    }
  }

  const answerVarsCasified = new Set([...answerVars].map(casify));
  for (const v of sampleSpec.variables) {
    if (!answerVarsCasified.has(casify(v)) && !BUILTIN_NAMES.has(v.toLowerCase())) {
      errors.push(
        `samples: Variable "${v}" is listed in samples but does not appear in the answer formula. ` +
        `This is allowed but may indicate a typo.`
      );
    }
  }

  return errors;
}

function midpointVars(sampleSpec: SamplesSpec): { vars: Record<string, number>; description: string } {
  const vars: Record<string, number> = {};
  const parts: string[] = [];
  for (const v of sampleSpec.variables) {
    const [lo, hi] = sampleSpec.ranges[v];
    const mid = (lo + hi) / 2;
    vars[v] = mid;
    parts.push(`${v}=${mid}`);
  }
  return { vars, description: parts.join(', ') };
}

function testEvaluateAnswer(
  answer: string,
  testVars: Record<string, number>,
  testDescription: string,
  caseSensitive: boolean,
): string | undefined {
  try {
    requireCalc().evaluator(testVars, {}, answer, { caseSensitive });
    return undefined;
  } catch (e: any) {
    return (
      `answer: Formula evaluation failed with sample values {${testDescription}}: ${e.message}\n` +
      `Check that your formula is valid in the sampled range.`
    );
  }
}

function validateAdditionalAnswers(
  additionalAnswers: string,
  testVars: Record<string, number>,
  testDescription: string,
  caseSensitive: boolean,
): string[] {
  const errors: string[] = [];
  const extras = additionalAnswers.split(';').map(s => s.trim()).filter(Boolean);
  for (const extra of extras) {
    try {
      requireCalc().parse(extra);
    } catch {
      errors.push(`additionalAnswers: Could not parse "${extra}" as a math expression.`);
      continue;
    }
    try {
      requireCalc().evaluator(testVars, {}, extra, { caseSensitive });
    } catch (e: any) {
      errors.push(
        `additionalAnswers: "${extra}" failed with sample values {${testDescription}}: ${e.message}`
      );
    }
  }
  return errors;
}

/**
 * Validate FormulaGrader attributes at parse time.
 */
export function validateFormulaAttributes(attrs: Record<string, any>): string[] | undefined {
  const errors: string[] = [];
  const caseSensitive = attrs.caseSensitive === 'true' || attrs.caseSensitive === true;

  const tolError = validateTolerance(attrs.tolerance);
  if (tolError) errors.push(tolError);

  let answerVars: Set<string> = new Set();
  let answerValid = false;
  if (attrs.answer) {
    const result = validateAnswerFormula(String(attrs.answer));
    if (typeof result === 'string') {
      errors.push(result);
      return errors;
    }
    answerVars = result.vars;
    answerValid = true;
  }

  if (!attrs.samples) {
    errors.push(suggestSamplesSpec(answerVars));
    return errors;
  }

  // attrs.samples may be a pre-parsed SamplesSpec (via zod) or a raw string
  let sampleSpec: SamplesSpec;
  if (typeof attrs.samples === 'string') {
    const { parsed, errors: sampleErrors } = validateSamplesSpec(attrs.samples);
    if (sampleErrors.length > 0) {
      errors.push(...sampleErrors);
      return errors;
    }
    sampleSpec = parsed!;
  } else {
    sampleSpec = attrs.samples;
  }

  if (answerVars.size > 0) {
    errors.push(...crossValidateVariablesAndSamples(answerVars, sampleSpec, caseSensitive));
  }

  if (answerValid && errors.length === 0) {
    const { vars: testVars, description } = midpointVars(sampleSpec);

    const evalError = testEvaluateAnswer(String(attrs.answer), testVars, description, caseSensitive);
    if (evalError) errors.push(evalError);

    if (attrs.additionalAnswers) {
      errors.push(...validateAdditionalAnswers(String(attrs.additionalAnswers), testVars, description, caseSensitive));
    }
  }

  return errors.length > 0 ? errors : undefined;
}

// ═══════════════════════════════════════════════════════════════════════
// Input Validation (runtime, student-facing)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate that the student's input is a parseable math expression.
 */
export function validateFormulaInput(input: unknown, attrs: Record<string, any>): string[] | undefined {
  if (typeof input !== 'string') return ['Expected a string'];

  const shouldCheckVars = attrs.checkVariables !== 'false' && attrs.samples;
  let allowedVars: Record<string, number> = {};
  if (shouldCheckVars) {
    // attrs.samples may be a pre-parsed SamplesSpec (via zod) or a raw string
    const spec: SamplesSpec | null = typeof attrs.samples === 'string'
      ? validateSamplesSpec(attrs.samples).parsed
      : attrs.samples;
    if (spec) {
      for (const v of spec.variables) {
        allowedVars[v] = 0;
      }
    }
  }

  const caseSensitive = attrs.caseSensitive === 'true' || attrs.caseSensitive === true;

  try {
    requireCalc().evaluator(allowedVars, {}, input, { caseSensitive });
  } catch (e: any) {
    if (e.name === 'UndefinedVariable') {
      return shouldCheckVars ? [e.message] : undefined;
    }
    if (e.name === 'UnmatchedParenthesis') return [e.message];
    if (e.name === 'SyntaxError') return [e.message];
    if (e.name === 'ZeroDivisionError') return undefined;
    if (e.name === 'ValueError') return undefined;
    return [e.message || 'Invalid expression'];
  }
  return undefined;
}
