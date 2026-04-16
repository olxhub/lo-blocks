// calc/tolerance.ts — Tolerance parsing, validation, and comparison.
//
// Groups all tolerance-related logic:
// - Tolerance: branded type for validated tolerance strings
// - ToleranceSchema: zod schema that validates and brands tolerance strings
// - parseTolerance: string → numeric tolerance value (validates, throws on error)
// - validateTolerance: non-throwing wrapper for form validation
// - compareAbsolute: |student - instructor| <= tol  (numerical grading)
// - compareRelative: |student - instructor| <= ratio * max(|s|, |i|)  (formula grading)

import { z } from 'zod';
import { parseComplex } from './parse';
import { isComplex, coerce } from './complex.js';

// ═══════════════════════════════════════════════════════════════════════
// Branded type and Zod schema
// ═══════════════════════════════════════════════════════════════════════

/** Branded type: a validated tolerance string (e.g., "0.01", "5%"). */
export type Tolerance = string & { __brand: 'Tolerance' };

/**
 * Zod schema for tolerance strings. Validates format, returns branded string.
 * Idempotent: accepts already-branded Tolerance values unchanged (still strings at runtime).
 *
 * Use as `ToleranceSchema.optional()` in grader attribute definitions.
 */
export const ToleranceSchema = z.string()
  .superRefine((val, ctx) => {
    try {
      parseTolerance(val, 1);
    } catch (e: any) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: e.message });
    }
  })
  .transform(s => s as Tolerance);

/**
 * Parse a tolerance string into an absolute numeric tolerance.
 *
 * Validates and throws on invalid input. Accepts:
 * - Numbers: 0.01 (pass-through)
 * - Absolute strings: "0.01"
 * - Percentage strings: "5%" (resolved against `base`, e.g. 5% of 200 = 10)
 *
 * Callers must handle optionality before calling (i.e. don't pass undefined).
 */
export function parseTolerance(tol: string | number, base: number = 0): number {
  if (typeof tol === 'number') {
    if (isNaN(tol)) throw new Error('tolerance: NaN is not a valid tolerance.');
    if (tol < 0) throw new Error(`tolerance: ${tol} is not a valid non-negative number.`);
    return tol;
  }
  const s = String(tol).trim();
  if (s === '') throw new Error('tolerance: empty string is not a valid tolerance.');
  if (s.endsWith('%')) {
    const p = parseFloat(s.slice(0, -1));
    if (isNaN(p)) throw new Error(`tolerance: "${tol}" is not a valid percentage.`);
    if (p < 0) throw new Error(`tolerance: "${tol}" is not a valid non-negative number.`);
    if (isNaN(base)) base = 0;
    return p / 100 * base;
  }
  const n = parseFloat(s);
  if (isNaN(n)) throw new Error(`tolerance: "${tol}" is not a valid non-negative number.`);
  if (n < 0) throw new Error(`tolerance: "${tol}" is not a valid non-negative number.`);
  return n;
}

/**
 * Validate a tolerance string (non-throwing, for form validation).
 * Returns an error message or undefined if valid.
 * Accepts undefined/empty as valid (tolerance is optional in most contexts).
 */
export function validateTolerance(tolerance: string | undefined): string | undefined {
  if (tolerance === undefined || tolerance === '') return undefined;
  try {
    parseTolerance(tolerance, 1);
    return undefined;
  } catch (e: any) {
    return e.message;
  }
}

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
