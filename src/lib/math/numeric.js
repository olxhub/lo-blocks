import Complex from 'complex.js';
import { CORRECTNESS } from '../blocks/correctness.js';

// TODO: We probably want to treat int as int, float as float,
// etc. instead of making everything complex

// TODO: Probably, we'd rather raise an exception on NaN, and handle
// that as an invalid input

export function parseComplex(value) {
  if (value instanceof Complex) return value;
  if (typeof value === 'number') return new Complex(value, 0);
  if (typeof value !== 'string') return new Complex(NaN, NaN);
  let str = value.trim();
  if (str === '') return new Complex(NaN, NaN);
  str = str.replace(/j/gi, 'i');
  try {
    return new Complex(str);
  } catch (e) {
    return new Complex(NaN, NaN);
  }
}

export function parseTolerance(tol, base=0) {
  if (tol === undefined || tol === null || tol === '') return 0;
  if (typeof tol === 'number') return Math.abs(tol);
  let s = String(tol).trim();
  if (s.endsWith('%')) {
    const p = parseFloat(s.slice(0, -1));
    if (isNaN(p)) return NaN;
    if (isNaN(base)) base = 0;
    return Math.abs(p/100 * base);
  }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : Math.abs(n);
}

export function parseRange(str) {
  const m = String(str).trim().match(/^([\[(])\s*([^,]+)\s*,\s*([^\])]*)\s*([\])])$/);
  if (!m) return null;
  return {
    lowerInclusive: m[1] === '[',
    upperInclusive: m[4] === ']',
    lower: parseComplex(m[2]),
    upper: parseComplex(m[3])
  };
}

export function inRange(value, range, tol=0) {
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

export function compareWithTolerance(student, instructor, tol=0) {
  const s = parseComplex(student);
  const i = parseComplex(instructor);
  if (isNaN(s.re) || isNaN(s.im) || isNaN(i.re) || isNaN(i.im)) return false;
  const diff = s.sub(i).abs();
  return diff <= tol;
}

export function gradeNumerical(props, input) {
  const answer = props.answer;

  if (input === undefined || input === null || String(input).trim() === '') {
    return { correct: CORRECTNESS.INVALID, message: 'No answer provided' };
  }

  const student = parseComplex(input);
  if (isNaN(student.re) || isNaN(student.im)) {
    return { correct: CORRECTNESS.INVALID, message: 'Invalid number' };
  }

  if (typeof answer === 'string' && /^\s*[\[(].*[\])]\s*$/.test(answer)) {
    const range = parseRange(answer);
    if (!range) {
      return { correct: CORRECTNESS.INVALID, message: 'Invalid range specification' };
    }
    const base = Math.abs(range.upper.re - range.lower.re);
    const tolerance = parseTolerance(props.tolerance, base);
    const ok = inRange(student, range, tolerance);
    return { correct: ok ? CORRECTNESS.CORRECT : CORRECTNESS.INCORRECT, message: '' };
  }

  const base = parseComplex(answer).abs();
  const tolerance = parseTolerance(props.tolerance, base);
  const ok = compareWithTolerance(student, answer, tolerance);
  return { correct: ok ? CORRECTNESS.CORRECT : CORRECTNESS.INCORRECT, message: '' };
}
