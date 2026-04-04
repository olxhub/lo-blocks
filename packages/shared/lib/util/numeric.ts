// Numerical grading utilities: parsing, tolerance, range checking, ratio matching.
import { evaluator } from '@/lib/util/calc/index.js';
import { Complex } from '@/lib/util/calc/complex.js';
import { validateTolerance } from '@/lib/util/calc/types';

export interface NumericRange {
  lowerInclusive: boolean;
  upperInclusive: boolean;
  lower: Complex;
  upper: Complex;
}

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

// TODO: We probably want to treat int as int, float as float,
// etc. instead of making everything complex

// TODO: Probably, we'd rather raise an exception on NaN, and handle
// that as an invalid input

export function parseComplex(value: unknown): Complex {
  if (value instanceof Complex) return value;
  if (typeof value === 'number') {
    return isNaN(value) ? new Complex(NaN, NaN) : new Complex(value, 0);
  }
  if (typeof value !== 'string') return new Complex(NaN, NaN);
  const str = value.trim();
  if (str === '') return new Complex(NaN, NaN);
  try {
    const result = evaluator({}, {}, str);
    return Complex.isComplex(result) ? result : new Complex(result, 0);
  } catch {
    return new Complex(NaN, NaN);
  }
}

export function parseTolerance(tol: string | number | null | undefined, base: number = 0): number {
  if (tol === undefined || tol === null || tol === '') return 0;
  if (typeof tol === 'number') return Math.abs(tol);
  let s = String(tol).trim();
  if (s.endsWith('%')) {
    const p = parseFloat(s.slice(0, -1));
    if (isNaN(p)) return NaN;
    if (isNaN(base)) base = 0;
    return Math.abs(p/100 * base);
  }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : Math.abs(n);
}

export function parseRange(str: string): NumericRange | null {
  const m = String(str).trim().match(/^([\[(])\s*([^,]+)\s*,\s*([^\])]*)\s*([\])])$/);
  if (!m) return null;
  return {
    lowerInclusive: m[1] === '[',
    upperInclusive: m[4] === ']',
    lower: parseComplex(m[2]),
    upper: parseComplex(m[3])
  };
}

/**
 * Validate NumericalGrader attributes at parse time.
 * Returns array of error messages or undefined if valid.
 */
export function validateNumericalAttributes(attrs: NumericalGraderAttributes): string[] | undefined {
  const errors: string[] = [];

  // Validate answer
  if (attrs.answer !== undefined) {
    const answerStr = String(attrs.answer).trim();

    // Check if it's a range
    if (/^\s*[\[(].*[\])]\s*$/.test(answerStr)) {
      const range = parseRange(answerStr);
      if (!range) {
        errors.push(`answer: Invalid range format "${attrs.answer}". Expected format like "[0, 10]" or "(0, 10)".`);
      } else {
        if (isNaN(range.lower.re) || isNaN(range.lower.im)) {
          errors.push(`answer: Invalid lower bound in range "${attrs.answer}".`);
        }
        if (isNaN(range.upper.re) || isNaN(range.upper.im)) {
          errors.push(`answer: Invalid upper bound in range "${attrs.answer}".`);
        }
      }
    } else {
      // Single value - must be a valid number/complex
      const parsed = parseComplex(answerStr);
      if (isNaN(parsed.re) || isNaN(parsed.im)) {
        errors.push(`answer: "${attrs.answer}" is not a valid number.`);
      }
    }
  }

  // Validate tolerance
  const tolError = validateTolerance(attrs.tolerance);
  if (tolError) errors.push(tolError);

  return errors.length > 0 ? errors : undefined;
}

export function inRange(value: unknown, range: NumericRange, tol: number = 0): boolean {
  const v = parseComplex(value);
  const lo = range.lower;
  const hi = range.upper;
  if (v.im !== 0 || lo.im !== 0 || hi.im !== 0) return false;
  const x = v.re;
  const lower = lo.re;
  const upper = hi.re;
  if (range.lowerInclusive ? x < lower - tol : x <= lower - tol) return false;
  if (range.upperInclusive ? x > upper + tol : x >= upper + tol) return false;
  return true;
}

export function compareWithTolerance(student: unknown, instructor: unknown, tol: number = 0): boolean {
  const s = parseComplex(student);
  const i = parseComplex(instructor);
  if (isNaN(s.re) || isNaN(s.im) || isNaN(i.re) || isNaN(i.im)) return false;
  const subResult = s.sub(i);
  const diff = Complex.isComplex(subResult) ? subResult.abs() : Math.abs(subResult);
  return diff <= tol;
}

/**
 * Options for numerical matching.
 */
export interface NumericalMatchOptions {
  /** Tolerance for comparison. Can be absolute (e.g., 0.1) or percentage (e.g., "5%"). */
  tolerance?: number | string;
}

/**
 * Validate that a numerical input is a valid number.
 * Used by the framework's state machine before calling the match function.
 *
 * @param input - The student's answer
 * @returns Array of error messages, or undefined if valid
 */
export function validateNumericalInput(input: unknown): string[] | undefined {
  const student = parseComplex(input);
  if (isNaN(student.re) || isNaN(student.im)) {
    return ['Invalid number'];
  }
  return undefined;
}

/**
 * Pure numerical matching function (boolean predicate).
 *
 * This is the core predicate used by NumericalGrader, extracted for use in:
 * - DSL expressions: numericalMatch(@answer.value, 42, { tolerance: 0.1 })
 * - RulesGrader: <NumericalMatch answer="42" tolerance="0.1" />
 *
 * Supports:
 * - Real and complex numbers
 * - Range notation: "[0, 10]" for inclusive, "(0, 10)" for exclusive
 * - Absolute tolerance: { tolerance: 0.1 }
 * - Percentage tolerance: { tolerance: "5%" }
 *
 * Note: Assumes input has been validated. The framework handles
 * empty input (→ UNSUBMITTED) and invalid input (→ INVALID) before
 * calling this function.
 *
 * @param input - The student's answer (string or number)
 * @param answer - The expected answer or range
 * @param options - Match options (tolerance)
 * @returns true if input matches answer within tolerance
 */
export function numericalMatch(
  input: string | number,
  answer: string | number,
  options?: NumericalMatchOptions
): boolean {
  const student = parseComplex(input);
  const answerStr = String(answer);

  // Handle range notation
  if (/^\s*[\[(].*[\])]\s*$/.test(answerStr)) {
    const range = parseRange(answerStr);
    if (!range) {
      // Invalid range - author error, should be caught at parse time
      // Throw to let framework handle as INVALID
      throw new Error('Invalid range specification');
    }

    const base = Math.abs(range.upper.re - range.lower.re);
    const tolerance = parseTolerance(options?.tolerance, base);
    return inRange(student, range, tolerance);
  }

  // Handle single value with tolerance
  const base = parseComplex(answer).abs();
  const tolerance = parseTolerance(options?.tolerance, base);
  return compareWithTolerance(student, answer, tolerance);
}

/**
 * Validate ratio inputs (two numbers, denominator not zero).
 * Used by the framework's state machine before calling the match function.
 *
 * @param inputDict - { numerator, denominator } object from grader framework
 * @returns Array of error messages, or undefined if valid
 */
export function validateRatioInputs(inputDict: RatioInput): string[] | undefined {
  const { numerator, denominator } = inputDict;

  if (numerator === undefined || denominator === undefined) {
    return ['Need two inputs (numerator and denominator)'];
  }

  // Parse the inputs
  const numC = parseComplex(numerator);
  const denC = parseComplex(denominator);

  if (isNaN(numC.re) || isNaN(numC.im)) {
    return ['Invalid numerator'];
  }

  if (isNaN(denC.re) || isNaN(denC.im)) {
    return ['Invalid denominator'];
  }

  if (denC.abs() === 0) {
    return ['Division by zero'];
  }

  return undefined;
}

/**
 * Pure match function for ratio/fraction answers (boolean predicate).
 *
 * Compares the ratio of two numbers against an expected value.
 * For example, inputDict { numerator: 1, denominator: 2 } matches answer "0.5".
 *
 * Note: Assumes inputs have been validated. The framework handles
 * empty input (→ UNSUBMITTED) and invalid input (→ INVALID) before
 * calling this function.
 *
 * @param inputDict - { numerator, denominator } object from grader framework
 * @param answer - The expected ratio as a string (e.g., "0.5", "2")
 * @param options - Optional { tolerance: string }
 * @returns true if ratio matches answer within tolerance
 *
 * @example
 * ratioMatch({ numerator: 1, denominator: 2 }, "0.5")  // true
 * ratioMatch({ numerator: 4, denominator: 8 }, "0.5")  // true
 */
export function ratioMatch(
  inputDict: RatioInput,
  answer: string,
  options?: { tolerance?: string }
): boolean {
  const { numerator, denominator } = inputDict;

  // Parse the inputs (assumed valid by now)
  const numC = parseComplex(numerator);
  const denC = parseComplex(denominator);

  // Calculate ratio and compare
  const studentRatio = numC.div(denC);
  const base = parseComplex(answer).abs();
  const tolerance = parseTolerance(options?.tolerance, base);
  return compareWithTolerance(studentRatio, answer, tolerance);
}

