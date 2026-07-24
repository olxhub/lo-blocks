// packages/shared/lib/grading/numerical.ts — Thin glue: maps grader framework ↔ calc/ for numerical grading.
//
// Match functions are pure predicates: (input, answer, options?) → boolean.
// Validators compose general-purpose calc/ validators into the shapes
// that createGrader expects.

import { parseTolerance, validateTolerance, type Tolerance } from '@/lib/grading/calc/schemas';
import { requireCalc } from './calcLoader';

/** Attributes passed to NumericalGrader validation. */
interface NumericalGraderAttributes {
  answer?: string;
  tolerance?: string;
}

/** Student input for ratio grading (two named fields). */
interface RatioInput {
  numerator: unknown;
  denominator: unknown;
}

/**
 * Options for numerical matching.
 */
export interface NumericalMatchOptions {
  /** Tolerance for comparison. Can be absolute (e.g., 0.1) or percentage (e.g., "5%"). */
  tolerance?: Tolerance;
}

/**
 * Pure numerical matching function (boolean predicate).
 *
 * Supports real/complex numbers, range notation ("[0, 10]", "(0, 10)"),
 * absolute tolerance, and percentage tolerance.
 *
 * Assumes input has been validated. The framework handles
 * empty input (→ UNSUBMITTED) and invalid input (→ INVALID) before calling.
 */
export function numericalMatch(
  input: string | number,
  answer: string | number,
  options?: NumericalMatchOptions
): boolean {
  const student = requireCalc().parseComplex(input);
  const answerStr = String(answer);

  // Handle range notation
  if (/^\s*[\[(].*[\])]\s*$/.test(answerStr)) {
    const range = requireCalc().parseRange(answerStr);
    if (!range) {
      throw new Error('Invalid range specification');
    }
    const base = Math.abs(range.upper.re - range.lower.re);
    const tolerance = options?.tolerance != null ? parseTolerance(options.tolerance, base) : 0;
    return requireCalc().inRange(student, range, tolerance);
  }

  // Handle single value with tolerance
  const base = requireCalc().parseComplex(answer).abs();
  const tolerance = options?.tolerance != null ? parseTolerance(options.tolerance, base) : 0;
  return requireCalc().compareAbsolute(student, answer, tolerance);
}

/**
 * Validate that a numerical input is a valid number.
 */
export function validateNumericalInput(input: unknown): string[] | undefined {
  const error = requireCalc().validateNumber(input);
  return error ? ['Invalid number'] : undefined;
}

/**
 * Validate NumericalGrader attributes at parse time.
 */
export function validateNumericalAttributes(attrs: NumericalGraderAttributes): string[] | undefined {
  const errors: string[] = [];

  if (attrs.answer !== undefined) {
    const answerStr = String(attrs.answer).trim();

    if (/^\s*[\[(].*[\])]\s*$/.test(answerStr)) {
      const rangeErrors = requireCalc().validateRange(answerStr);
      if (rangeErrors) {
        errors.push(...rangeErrors.map(e => `answer: ${e}`));
      }
    } else {
      const numError = requireCalc().validateNumber(answerStr);
      if (numError) {
        errors.push(`answer: ${numError}`);
      }
    }
  }

  const tolError = validateTolerance(attrs.tolerance);
  if (tolError) errors.push(tolError);

  return errors.length > 0 ? errors : undefined;
}

/**
 * Validate ratio inputs (two numbers, denominator not zero).
 */
export function validateRatioInputs(inputDict: RatioInput): string[] | undefined {
  const { numerator, denominator } = inputDict;

  if (numerator === undefined || denominator === undefined) {
    return ['Need two inputs (numerator and denominator)'];
  }

  const numError = requireCalc().validateNumber(numerator);
  if (numError) return ['Invalid numerator'];

  const denError = requireCalc().validateNumber(denominator);
  if (denError) return ['Invalid denominator'];

  const denC = requireCalc().parseComplex(denominator);
  if (denC.abs() === 0) return ['Division by zero'];

  return undefined;
}

/**
 * Pure match function for ratio/fraction answers.
 *
 * Compares the ratio of two numbers against an expected value.
 * Assumes inputs have been validated.
 */
export function ratioMatch(
  inputDict: RatioInput,
  answer: string,
  options?: { tolerance?: Tolerance }
): boolean {
  const numC = requireCalc().parseComplex(inputDict.numerator);
  const denC = requireCalc().parseComplex(inputDict.denominator);
  const studentRatio = numC.div(denC);
  const base = requireCalc().parseComplex(answer).abs();
  const tolerance = options?.tolerance != null ? parseTolerance(options.tolerance, base) : 0;
  return requireCalc().compareAbsolute(studentRatio, answer, tolerance);
}
