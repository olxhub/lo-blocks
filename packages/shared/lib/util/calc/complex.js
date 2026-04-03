/**
 * Lightweight complex number class for openedx-calc.
 *
 * Uses "dual representation": plain JS numbers when imaginary part is zero,
 * Complex instances when needed. Mirrors numpy.lib.scimath behavior where
 * sqrt(4) = 2 (number) but sqrt(-1) = Complex(0, 1).
 */

const EPSILON = 1e-15;

export class Complex {
  constructor(re, im = 0) {
    this.re = re;
    this.im = im;
  }

  /** Return a plain number if imaginary part is negligible, else this. */
  maybeReal() {
    if (Math.abs(this.im) < EPSILON) return this.re;
    return this;
  }

  add(other) {
    const b = Complex.coerce(other);
    return new Complex(this.re + b.re, this.im + b.im).maybeReal();
  }

  sub(other) {
    const b = Complex.coerce(other);
    return new Complex(this.re - b.re, this.im - b.im).maybeReal();
  }

  mul(other) {
    const b = Complex.coerce(other);
    return new Complex(
      this.re * b.re - this.im * b.im,
      this.re * b.im + this.im * b.re
    ).maybeReal();
  }

  div(other) {
    const b = Complex.coerce(other);
    const denom = b.re * b.re + b.im * b.im;
    return new Complex(
      (this.re * b.re + this.im * b.im) / denom,
      (this.im * b.re - this.re * b.im) / denom
    ).maybeReal();
  }

  neg() {
    return new Complex(-this.re, -this.im);
  }

  abs() {
    return Math.sqrt(this.re * this.re + this.im * this.im);
  }

  /** Complex exponentiation: this^other */
  pow(other) {
    const b = Complex.coerce(other);
    // 0^anything: handle special cases
    if (this.re === 0 && this.im === 0) {
      if (b.re > 0) return 0;
      if (b.re === 0 && b.im === 0) return 1;
      return NaN;
    }
    // Use the identity: a^b = exp(b * ln(a))
    const lnA = Complex.log(this);
    const lnAc = Complex.coerce(lnA);
    const bc = Complex.coerce(b);
    const product = lnAc.mul(bc);
    const productC = Complex.coerce(product);
    return Complex.exp(productC);
  }

  toString() {
    if (this.im === 0) return `${this.re}`;
    if (this.re === 0) return `${this.im}j`;
    const sign = this.im >= 0 ? '+' : '-';
    return `${this.re}${sign}${Math.abs(this.im)}j`;
  }

  static isComplex(val) {
    return val instanceof Complex;
  }

  static coerce(val) {
    if (val instanceof Complex) return val;
    return new Complex(val, 0);
  }

  // --- Static math functions ---

  static exp(z) {
    z = Complex.coerce(z);
    const r = Math.exp(z.re);
    return new Complex(r * Math.cos(z.im), r * Math.sin(z.im)).maybeReal();
  }

  static log(z) {
    z = Complex.coerce(z);
    const r = Math.sqrt(z.re * z.re + z.im * z.im);
    const theta = Math.atan2(z.im, z.re);
    return new Complex(Math.log(r), theta).maybeReal();
  }

  static log10(z) {
    const ln = Complex.log(z);
    return divide(ln, Math.LN10);
  }

  static log2(z) {
    const ln = Complex.log(z);
    return divide(ln, Math.LN2);
  }

  static sqrt(z) {
    z = Complex.coerce(z);
    if (z.im === 0 && z.re >= 0) return Math.sqrt(z.re);
    const r = z.abs();
    const theta = Math.atan2(z.im, z.re);
    return new Complex(
      Math.sqrt(r) * Math.cos(theta / 2),
      Math.sqrt(r) * Math.sin(theta / 2)
    ).maybeReal();
  }

  static sin(z) {
    z = Complex.coerce(z);
    return new Complex(
      Math.sin(z.re) * Math.cosh(z.im),
      Math.cos(z.re) * Math.sinh(z.im)
    ).maybeReal();
  }

  static cos(z) {
    z = Complex.coerce(z);
    return new Complex(
      Math.cos(z.re) * Math.cosh(z.im),
      -Math.sin(z.re) * Math.sinh(z.im)
    ).maybeReal();
  }

  static tan(z) {
    return divide(Complex.sin(z), Complex.cos(z));
  }

  static arcsin(z) {
    z = Complex.coerce(z);
    // Handle real inputs specially to get correct branch cut behavior
    // (matching numpy.lib.scimath / C99 convention)
    if (z.im === 0) {
      if (z.re >= -1 && z.re <= 1) return Math.asin(z.re);
      // |x| > 1: complex result with positive imaginary part
      if (z.re > 1) return new Complex(Math.PI / 2, Math.acosh(z.re));
      return new Complex(-Math.PI / 2, Math.acosh(-z.re));
    }
    // General complex: arcsin(z) = -i * ln(iz + sqrt(1 - z^2))
    const iz = new Complex(-z.im, z.re); // i * z
    const oneMinusZ2 = subtract(1, multiply(z, z));
    const sqrtPart = Complex.sqrt(Complex.coerce(oneMinusZ2));
    const inner = add(iz, sqrtPart);
    const lnPart = Complex.log(Complex.coerce(inner));
    // -i * lnPart
    const lnC = Complex.coerce(lnPart);
    return new Complex(lnC.im, -lnC.re).maybeReal();
  }

  static arccos(z) {
    // arccos(z) = pi/2 - arcsin(z)
    return subtract(Math.PI / 2, Complex.arcsin(z));
  }

  static arctan(z) {
    z = Complex.coerce(z);
    // For real args, use Math.atan
    if (z.im === 0) return Math.atan(z.re);
    // arctan(z) = i/2 * ln((1-iz)/(1+iz))
    const iz = new Complex(-z.im, z.re);
    const num = subtract(1, iz);
    const den = add(1, iz);
    const ratio = divide(num, den);
    const lnPart = Complex.log(Complex.coerce(ratio));
    // i/2 * lnPart
    const lnC = Complex.coerce(lnPart);
    return new Complex(-lnC.im / 2, lnC.re / 2).maybeReal();
  }

  static sinh(z) {
    z = Complex.coerce(z);
    return new Complex(
      Math.sinh(z.re) * Math.cos(z.im),
      Math.cosh(z.re) * Math.sin(z.im)
    ).maybeReal();
  }

  static cosh(z) {
    z = Complex.coerce(z);
    return new Complex(
      Math.cosh(z.re) * Math.cos(z.im),
      Math.sinh(z.re) * Math.sin(z.im)
    ).maybeReal();
  }

  static tanh(z) {
    return divide(Complex.sinh(z), Complex.cosh(z));
  }

  static arcsinh(z) {
    // arcsinh(z) = ln(z + sqrt(z^2 + 1))
    z = Complex.coerce(z);
    const z2p1 = add(multiply(z, z), 1);
    const sqrtPart = Complex.sqrt(Complex.coerce(z2p1));
    const inner = add(z, sqrtPart);
    return Complex.log(Complex.coerce(inner));
  }

  static arccosh(z) {
    // arccosh(z) = ln(z + sqrt(z^2 - 1))
    z = Complex.coerce(z);
    const z2m1 = subtract(multiply(z, z), 1);
    const sqrtPart = Complex.sqrt(Complex.coerce(z2m1));
    const inner = add(z, sqrtPart);
    return Complex.log(Complex.coerce(inner));
  }

  static arctanh(z) {
    // arctanh(z) = 0.5 * ln((1+z)/(1-z))
    z = Complex.coerce(z);
    const num = add(1, z);
    const den = subtract(1, z);
    const ratio = divide(num, den);
    const lnPart = Complex.log(Complex.coerce(ratio));
    return multiply(0.5, lnPart);
  }
}

// --- Arithmetic dispatch helpers ---
// These handle the mixed number/Complex dispatch.

export function add(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  return Complex.coerce(a).add(Complex.coerce(b));
}

export function subtract(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return Complex.coerce(a).sub(Complex.coerce(b));
}

export function multiply(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a * b;
  return Complex.coerce(a).mul(Complex.coerce(b));
}

export function divide(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a / b;
  return Complex.coerce(a).div(Complex.coerce(b));
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
      return Complex.coerce(a).pow(Complex.coerce(b));
    }
    return result;
  }
  return Complex.coerce(a).pow(Complex.coerce(b));
}
