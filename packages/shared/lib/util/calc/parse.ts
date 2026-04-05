// calc/parse.ts — General-purpose parsers and validators for numeric values,
// ranges, and expressions.
//
// Grouped by concept:
// - Complex numbers: parseComplex, validateNumber
// - Ranges: parseRange, validateRange, inRange
// - Expressions: validateFormula

import { evaluator, isComplex } from './index.js';
import { complex, type Complex } from 'mathjs';

export interface NumericRange {
  lowerInclusive: boolean;
  upperInclusive: boolean;
  lower: Complex;
  upper: Complex;
}

// ═══════════════════════════════════════════════════════════════════════
// Complex numbers
// ═══════════════════════════════════════════════════════════════════════

// TODO: We probably want to treat int as int, float as float,
// etc. instead of making everything complex

// TODO: Probably, we'd rather raise an exception on NaN, and handle
// that as an invalid input

export function parseComplex(value: unknown): Complex {
  if (isComplex(value)) return value as Complex;
  if (typeof value === 'number') {
    return isNaN(value) ? complex(NaN, NaN) : complex(value, 0);
  }
  if (typeof value !== 'string') return complex(NaN, NaN);
  const str = value.trim();
  if (str === '') return complex(NaN, NaN);
  try {
    const result = evaluator({}, {}, str);
    return isComplex(result) ? result as Complex : complex(result, 0);
  } catch {
    return complex(NaN, NaN);
  }
}

/** Validate that a value is a parseable number or complex. */
export function validateNumber(value: unknown): string | undefined {
  const parsed = parseComplex(value);
  if (isNaN(parsed.re) || isNaN(parsed.im)) {
    return `"${value}" is not a valid number.`;
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════
// Ranges
// ═══════════════════════════════════════════════════════════════════════

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

/** Validate a range string like "[0, 10]" or "(0, 10)". */
export function validateRange(str: string): string[] | undefined {
  const range = parseRange(str);
  if (!range) {
    return [`Invalid range format "${str}". Expected format like "[0, 10]" or "(0, 10)".`];
  }
  const errors: string[] = [];
  if (isNaN(range.lower.re) || isNaN(range.lower.im)) {
    errors.push(`Invalid lower bound in range "${str}".`);
  }
  if (isNaN(range.upper.re) || isNaN(range.upper.im)) {
    errors.push(`Invalid upper bound in range "${str}".`);
  }
  return errors.length > 0 ? errors : undefined;
}

/**
 * Check if a value falls within a numeric range, with optional tolerance
 * that widens the bounds.
 */
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

// ═══════════════════════════════════════════════════════════════════════
// Expressions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate that a string is a parseable math expression.
 * Optionally restricts to allowed variables (e.g. from a samples spec).
 */
export function validateFormula(
  expr: string,
  options?: {
    allowedVariables?: Record<string, number>;
    caseSensitive?: boolean;
  },
): string | undefined {
  if (typeof expr !== 'string') return 'Expected a string';
  try {
    evaluator(options?.allowedVariables ?? {}, {}, expr, {
      caseSensitive: options?.caseSensitive ?? false,
    });
    return undefined;
  } catch (e: any) {
    // UndefinedVariable is only an error if we're checking variables
    if (e.name === 'UndefinedVariable' && !options?.allowedVariables) return undefined;
    // ZeroDivisionError / ValueError aren't syntax errors — the formula is valid
    if (e.name === 'ZeroDivisionError' || e.name === 'ValueError') return undefined;
    return e.message || 'Invalid expression';
  }
}
