// calc/tolerance.ts — Numeric comparison with tolerance.
//
// Two strategies:
// - compareAbsolute: |student - instructor| <= tol  (numerical grading)
// - compareRelative: |student - instructor| <= ratio * max(|s|, |i|)  (formula grading)
//
// inRange: check if a real value falls within [lo, hi] with optional tolerance.

import { parseComplex } from './parse';
import { isComplex, coerce } from './complex.js';
import type { NumericRange } from './parse';

/**
 * Absolute tolerance comparison.
 * Returns true if |student - instructor| <= tol.
 */
export function compareAbsolute(student: unknown, instructor: unknown, tol: number = 0): boolean {
  const s = parseComplex(student);
  const i = parseComplex(instructor);
  if (isNaN(s.re) || isNaN(s.im) || isNaN(i.re) || isNaN(i.im)) return false;
  const diff = s.sub(i).abs();
  return diff <= tol;
}

/**
 * Relative tolerance comparison.
 * Tolerance is a ratio (default 0.00001 = 0.001%) multiplied by the larger
 * of the two magnitudes. Matches Open edX's compare_with_tolerance.
 */
export function compareRelative(
  student: number | { re: number; im: number; abs(): number; sub(other: any): any },
  instructor: number | { re: number; im: number; abs(): number; sub(other: any): any },
  ratio: number = 0.00001,
): boolean {
  const sAbs = isComplex(student) ? (student as any).abs() : Math.abs(student as number);
  const iAbs = isComplex(instructor) ? (instructor as any).abs() : Math.abs(instructor as number);

  if (isNaN(sAbs) || isNaN(iAbs)) return false;
  if (!isFinite(sAbs) || !isFinite(iAbs)) return sAbs === iAbs;

  const tol = ratio * Math.max(sAbs, iAbs);

  if (isComplex(student) || isComplex(instructor)) {
    const s = coerce(student as any);
    const i = coerce(instructor as any);
    return s.sub(i).abs() <= tol;
  }
  return Math.abs((student as number) - (instructor as number)) <= tol;
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
