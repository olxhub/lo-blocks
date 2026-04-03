/**
 * Default math functions and constants for openedx-calc.
 * Port of calc/functions.py and the DEFAULT_* dicts from calc/calc.py.
 */

import { Complex, divide, subtract, multiply, add } from './complex.js';

// --- Trig functions (with complex support) ---

function sin(x) {
  if (typeof x === 'number') return Math.sin(x);
  return Complex.sin(x);
}

function cos(x) {
  if (typeof x === 'number') return Math.cos(x);
  return Complex.cos(x);
}

function tan(x) {
  if (typeof x === 'number') return Math.tan(x);
  return Complex.tan(x);
}

function sec(x) { return divide(1, cos(x)); }
function csc(x) { return divide(1, sin(x)); }
function cot(x) { return divide(1, tan(x)); }

// --- Inverse trig ---

function arcsin(x) {
  if (typeof x === 'number' && x >= -1 && x <= 1) return Math.asin(x);
  return Complex.arcsin(x);
}

function arccos(x) {
  if (typeof x === 'number' && x >= -1 && x <= 1) return Math.acos(x);
  return Complex.arccos(x);
}

function arctan(x) {
  if (typeof x === 'number') return Math.atan(x);
  return Complex.arctan(x);
}

function arcsec(x) { return arccos(divide(1, x)); }
function arccsc(x) { return arcsin(divide(1, x)); }

function arccot(x) {
  const re = Complex.isComplex(x) ? x.re : x;
  if (re < 0) {
    return subtract(-Math.PI / 2, arctan(x));
  }
  return subtract(Math.PI / 2, arctan(x));
}

// --- Hyperbolic ---

function sinh(x) {
  if (typeof x === 'number') return Math.sinh(x);
  return Complex.sinh(x);
}

function cosh(x) {
  if (typeof x === 'number') return Math.cosh(x);
  return Complex.cosh(x);
}

function tanh(x) {
  if (typeof x === 'number') return Math.tanh(x);
  return Complex.tanh(x);
}

function sech(x) { return divide(1, cosh(x)); }
function csch(x) { return divide(1, sinh(x)); }
function coth(x) { return divide(1, tanh(x)); }

// --- Inverse hyperbolic ---

function arcsinh(x) {
  if (typeof x === 'number') return Math.asinh(x);
  return Complex.arcsinh(x);
}

function arccosh(x) {
  if (typeof x === 'number' && x >= 1) return Math.acosh(x);
  return Complex.arccosh(x);
}

function arctanh(x) {
  if (typeof x === 'number' && x > -1 && x < 1) return Math.atanh(x);
  return Complex.arctanh(x);
}

function arcsech(x) { return arccosh(divide(1, x)); }
function arccsch(x) { return arcsinh(divide(1, x)); }
function arccoth(x) { return arctanh(divide(1, x)); }

// --- Log / Exp / Sqrt ---

function ln(x) {
  if (typeof x === 'number' && x > 0) return Math.log(x);
  return Complex.log(x);
}

function log10(x) {
  if (typeof x === 'number' && x > 0) return Math.log10(x);
  return Complex.log10(x);
}

function log2(x) {
  if (typeof x === 'number' && x > 0) return Math.log2(x);
  return Complex.log2(x);
}

function exp(x) {
  if (typeof x === 'number') return Math.exp(x);
  return Complex.exp(x);
}

function sqrt(x) {
  if (typeof x === 'number' && x >= 0) return Math.sqrt(x);
  return Complex.sqrt(x);
}

// --- Other ---

function abs(x) {
  if (Complex.isComplex(x)) return x.abs();
  return Math.abs(x);
}

function factorial(x) {
  if (Complex.isComplex(x)) throw new TypeError("factorial() only accepts integral values");
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

export const SUFFIXES = {
  '%': (x) => x * 0.01,
};

export { ValueError };
