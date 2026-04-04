// calc/parse.ts — General-purpose parsers for numeric values, ranges, and tolerances.
//
// These are pure parsing utilities: string → typed value.
// No grading logic, no framework coupling.

import { evaluator, isComplex } from './index.js';
import { Complex } from 'complex.js';

export interface NumericRange {
  lowerInclusive: boolean;
  upperInclusive: boolean;
  lower: Complex;
  upper: Complex;
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
    return isComplex(result) ? result as Complex : new Complex(result, 0);
  } catch {
    return new Complex(NaN, NaN);
  }
}

export function parseTolerance(tol: string | number | null | undefined, base: number = 0): number {
  if (tol === undefined || tol === null || tol === '') return 0;
  if (typeof tol === 'number') return Math.abs(tol);
  const s = String(tol).trim();
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
