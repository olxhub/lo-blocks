// calc/parse.ts — General-purpose parsers for numeric values, ranges, and tolerances.
//
// These are pure parsing utilities: string → typed value.
// No grading logic, no framework coupling.

import { evaluator, isComplex } from './index.js';
import { complex, type Complex } from 'mathjs';

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
