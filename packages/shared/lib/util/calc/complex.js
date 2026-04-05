// Adapter: re-exports math.js Complex with dual-representation dispatch helpers.
//
// Dual representation: arithmetic returns plain JS numbers when the imaginary
// part is negligible (< EPSILON). This matches numpy.lib.scimath behavior
// where sqrt(4) = 2 (number) but sqrt(-1) = Complex(0, 1).
//
// TODO: This is unnecessary onion code. It should go away.
// - We started with our own complex class and moved to math.js
// - As we adopt more of math.js (fractions, units, bigints), the adapter shrinks.
// - We should make a pass to get rid of it entirely.
import { Complex, isComplex as mathjsIsComplex } from 'mathjs';

const EPSILON = 1e-15;

/** Return plain number if imaginary part is negligible, else the Complex. */
export function maybeReal(c) {
  if (!(c instanceof Complex)) return c;
  if (Math.abs(c.im) < EPSILON) return c.re;
  return c;
}

export function isComplex(val) {
  return mathjsIsComplex(val);
}

export function coerce(val) {
  if (val instanceof Complex) return val;
  return new Complex(val, 0);
}

// --- Arithmetic dispatch helpers ---
// These handle the mixed number/Complex dispatch with dual representation.

export function add(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  return maybeReal(coerce(a).add(coerce(b)));
}

export function subtract(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return maybeReal(coerce(a).sub(coerce(b)));
}

export function multiply(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a * b;
  return maybeReal(coerce(a).mul(coerce(b)));
}

export function divide(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a / b;
  return maybeReal(coerce(a).div(coerce(b)));
}

export function negate(a) {
  if (typeof a === 'number') return -a;
  return a.neg();
}

export function power(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    const result = Math.pow(a, b);
    if (isNaN(result) && a < 0) {
      // e.g. (-8)^(1/3) — use complex path
      return maybeReal(coerce(a).pow(coerce(b)));
    }
    return result;
  }
  return maybeReal(coerce(a).pow(coerce(b)));
}

export { Complex };
