// packages/shared/lib/util/calc/tolerance.ts — Tolerance comparison.
//
// The mathjs-coupled half of tolerance handling:
// - compareAbsolute: |student - instructor| <= tol  (numerical grading)
// - compareRelative: |student - instructor| <= ratio * max(|s|, |i|)  (formula grading)
//
// Parsing, validation, and the zod schema (Tolerance, ToleranceSchema,
// parseTolerance, validateTolerance) live in schemas.ts — mathjs-free so
// blueprints can validate attributes at parse time without loading the
// math engine. Re-exported here for existing importers.

import { parseComplex } from './parse';
import { isComplex, coerce } from './complex.js';

export { parseTolerance, validateTolerance, ToleranceSchema, type Tolerance } from './schemas';

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
