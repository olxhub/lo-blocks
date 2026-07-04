/**
 * Default math functions and constants for openedx-calc.
 * Port of calc/functions.py and the DEFAULT_* dicts from calc/calc.py.
 *
 * Branch cut convention: matches numpy.lib.scimath / C99. For arcsin of
 * real x > 1, the imaginary part is positive (unlike math.js's convention).
 */

import { Complex, isComplex, coerce, maybeReal, divide, subtract } from './complex.js';
import { BUILTIN_VARIABLE_NAMES, BUILTIN_FUNCTION_NAMES } from './schemas';

// --- Trig functions (with complex support) ---

function sin(x) {
  if (typeof x === 'number') return Math.sin(x);
  return maybeReal(x.sin());
}

function cos(x) {
  if (typeof x === 'number') return Math.cos(x);
  return maybeReal(x.cos());
}

function tan(x) {
  if (typeof x === 'number') return Math.tan(x);
  return maybeReal(x.tan());
}

function sec(x) { return divide(1, cos(x)); }
function csc(x) { return divide(1, sin(x)); }
function cot(x) { return divide(1, tan(x)); }

// --- Inverse trig ---
// Custom branch cut handling for real inputs outside domain to match
// numpy/C99 convention (positive imaginary for arcsin(x > 1)).

function arcsin(x) {
  if (typeof x === 'number') {
    if (x >= -1 && x <= 1) return Math.asin(x);
    // numpy/C99: positive imaginary part for out-of-domain reals
    if (x > 1) return new Complex(Math.PI / 2, Math.acosh(x));
    return new Complex(-Math.PI / 2, Math.acosh(-x));
  }
  return maybeReal(x.asin());
}

function arccos(x) {
  if (typeof x === 'number' && x >= -1 && x <= 1) return Math.acos(x);
  // Derived from arcsin to preserve branch cut convention
  return subtract(Math.PI / 2, arcsin(x));
}

function arctan(x) {
  if (typeof x === 'number') return Math.atan(x);
  return maybeReal(x.atan());
}

function arcsec(x) { return arccos(divide(1, x)); }
function arccsc(x) { return arcsin(divide(1, x)); }

function arccot(x) {
  const re = isComplex(x) ? x.re : x;
  if (re < 0) {
    return subtract(-Math.PI / 2, arctan(x));
  }
  return subtract(Math.PI / 2, arctan(x));
}

// --- Hyperbolic ---

function sinh(x) {
  if (typeof x === 'number') return Math.sinh(x);
  return maybeReal(x.sinh());
}

function cosh(x) {
  if (typeof x === 'number') return Math.cosh(x);
  return maybeReal(x.cosh());
}

function tanh(x) {
  if (typeof x === 'number') return Math.tanh(x);
  return maybeReal(x.tanh());
}

function sech(x) { return divide(1, cosh(x)); }
function csch(x) { return divide(1, sinh(x)); }
function coth(x) { return divide(1, tanh(x)); }

// --- Inverse hyperbolic ---

function arcsinh(x) {
  if (typeof x === 'number') return Math.asinh(x);
  return maybeReal(x.asinh());
}

function arccosh(x) {
  if (typeof x === 'number' && x >= 1) return Math.acosh(x);
  return maybeReal(coerce(x).acosh());
}

function arctanh(x) {
  if (typeof x === 'number' && x > -1 && x < 1) return Math.atanh(x);
  return maybeReal(coerce(x).atanh());
}

function arcsech(x) { return arccosh(divide(1, x)); }
function arccsch(x) { return arcsinh(divide(1, x)); }
function arccoth(x) { return arctanh(divide(1, x)); }

// --- Log / Exp / Sqrt ---

function ln(x) {
  if (typeof x === 'number' && x > 0) return Math.log(x);
  return maybeReal(coerce(x).log());
}

function log10(x) {
  if (typeof x === 'number' && x > 0) return Math.log10(x);
  return maybeReal(coerce(x).log().div(Math.LN10));
}

function log2(x) {
  if (typeof x === 'number' && x > 0) return Math.log2(x);
  return maybeReal(coerce(x).log().div(Math.LN2));
}

function exp(x) {
  if (typeof x === 'number') return Math.exp(x);
  return maybeReal(x.exp());
}

function sqrt(x) {
  if (typeof x === 'number' && x >= 0) return Math.sqrt(x);
  return maybeReal(coerce(x).sqrt());
}

// --- Other ---

function abs(x) {
  if (isComplex(x)) return x.abs();
  return Math.abs(x);
}

function factorial(x) {
  if (isComplex(x)) throw new TypeError("factorial() only accepts integral values");
  if (!Number.isInteger(x)) throw new TypeError("factorial() only accepts integral values");
  if (x < 0) throw new ValueError("factorial() not defined for negative values");
  if (x > 170) return Infinity;
  let result = 1;
  for (let i = 2; i <= x; i++) result *= i;
  return result;
}

class ValueError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValueError';
  }
}

export const DEFAULT_FUNCTIONS = {
  sin, cos, tan, sec, csc, cot,
  arcsin, arccos, arctan, arcsec, arccsc, arccot,
  sinh, cosh, tanh, sech, csch, coth,
  arcsinh, arccosh, arctanh, arcsech, arccsch, arccoth,
  sqrt, log10, log2, ln, exp,
  abs,
  fact: factorial,
  factorial,
};

export const DEFAULT_VARIABLES = {
  i: new Complex(0, 1),
  j: new Complex(0, 1),
  e: Math.E,
  pi: Math.PI,
};

// The canonical NAME lists live in schemas.ts (mathjs-free, so attribute
// validation can check built-in shadowing without loading the math engine).
// Assert the implementations here match that contract — drift fails fast
// the first time the engine loads.
{
  const check = (declared, actual, kind) => {
    const d = [...declared].sort().join(',');
    const a = Object.keys(actual).sort().join(',');
    if (d !== a) {
      throw new Error(
        `calc: built-in ${kind} names in schemas.ts do not match functions.js.\n` +
        `  schemas.ts:   ${d}\n  functions.js: ${a}\n` +
        `Update BUILTIN_${kind.toUpperCase()}_NAMES in schemas.ts.`
      );
    }
  };
  check(BUILTIN_VARIABLE_NAMES, DEFAULT_VARIABLES, 'variable');
  check(BUILTIN_FUNCTION_NAMES, DEFAULT_FUNCTIONS, 'function');
}

export const SUFFIXES = {
  '%': (x) => x * 0.01,
};

export { ValueError };
