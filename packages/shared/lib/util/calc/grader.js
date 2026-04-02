/**
 * Sampling-based formula grader.
 * Port of FormulaResponse.check_formula from responsetypes.py.
 */

import { evaluator, Complex } from './index.js';

const DEFAULT_TOLERANCE = 0.00001; // 0.001% as a ratio

/**
 * Parse a samples spec like "x,y@-5,-10:5,10#11".
 * Returns { variables: ['x','y'], ranges: {x:[-5,5], y:[-10,10]}, numSamples: 11 }
 */
export function parseSamples(spec) {
  const [varPart, rest] = spec.split('@');
  const variables = varPart.split(',').map(s => s.trim());
  const [rangePart, countPart] = rest.split('#');
  const numSamples = parseInt(countPart, 10);
  const [minsStr, maxsStr] = rangePart.split(':');
  const mins = minsStr.split(',').map(Number);
  const maxs = maxsStr.split(',').map(Number);
  const ranges = {};
  variables.forEach((v, i) => { ranges[v] = [mins[i], maxs[i]]; });
  return { variables, ranges, numSamples };
}

/**
 * Generate random sample points.
 * Returns an array of { varName: value } dicts.
 */
function randomizeVariables({ ranges, numSamples }, rng = Math.random) {
  const vars = Object.keys(ranges);
  const out = [];
  for (let i = 0; i < numSamples; i++) {
    const dict = {};
    for (const v of vars) {
      const [lo, hi] = ranges[v];
      dict[v] = lo + rng() * (hi - lo);
    }
    out.push(dict);
  }
  return out;
}

/**
 * Compare two values with tolerance (port of compare_with_tolerance).
 * Default tolerance is relative: 0.001% of max(|student|, |instructor|).
 */
function compareWithTolerance(student, instructor, tolerance = DEFAULT_TOLERANCE) {
  const sAbs = Complex.isComplex(student) ? student.abs() : Math.abs(student);
  const iAbs = Complex.isComplex(instructor) ? instructor.abs() : Math.abs(instructor);

  // Relative tolerance: scale by the larger magnitude
  const tol = tolerance * Math.max(sAbs, iAbs);

  if (!isFinite(sAbs) || !isFinite(iAbs)) return sAbs === iAbs;
  if (isNaN(sAbs) || isNaN(iAbs)) return false;

  if (Complex.isComplex(student) || Complex.isComplex(instructor)) {
    const s = Complex.coerce(student);
    const i = Complex.coerce(instructor);
    const diff = s.sub(i);
    return diff.abs() <= tol;
  }
  return Math.abs(student - instructor) <= tol;
}

/**
 * Check if a student formula is equivalent to an expected formula
 * by evaluating both at random sample points.
 *
 * @param {string} expected  - correct formula (e.g. "x^2 - 1")
 * @param {string} given     - student formula (e.g. "(x-1)*(x+1)")
 * @param {string} samples   - sample spec (e.g. "x@-5:5#10")
 * @param {Object} [options]
 * @param {number} [options.tolerance]      - relative tolerance ratio (default 0.001%)
 * @param {boolean} [options.caseSensitive] - case sensitivity for evaluator
 * @param {Function} [options.rng]          - random number generator (for determinism)
 * @returns {{ correct: boolean, error: string|null }}
 */
export function checkFormula(expected, given, samples, {
  tolerance = DEFAULT_TOLERANCE,
  caseSensitive = false,
  rng = Math.random,
} = {}) {
  const spec = parseSamples(samples);
  const varDicts = randomizeVariables(spec, rng);
  const evalOpts = { caseSensitive };

  let studentResults, instructorResults;
  try {
    instructorResults = varDicts.map(v => evaluator(v, {}, expected, evalOpts));
  } catch (e) {
    return { correct: false, error: `Error in expected answer: ${e.message}` };
  }
  try {
    studentResults = varDicts.map(v => evaluator(v, {}, given, evalOpts));
  } catch (e) {
    return { correct: false, error: e.message };
  }

  const correct = studentResults.every((s, i) =>
    compareWithTolerance(s, instructorResults[i], tolerance)
  );
  return { correct, error: null };
}
