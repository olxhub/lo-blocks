/**
 * Sampling-based formula grader.
 *
 * Evaluates student and instructor formulas at random sample points within
 * a variable hypercube and checks that results agree within tolerance.
 *
 * Tolerance here is RELATIVE: a ratio multiplied by the larger magnitude.
 * Default 0.00001 = 0.001%. This matches Open edX's compare_with_tolerance.
 * (Contrast with numeric.ts which uses absolute tolerance after parseTolerance.)
 *
 * @see {import('./types').SamplesSpec} for the parsed samples type
 */

import { evaluator, Complex } from './index.js';

const DEFAULT_TOLERANCE = 0.00001; // 0.001% as a ratio

/**
 * Parse a samples spec string into a structured object.
 *
 * Assumes valid input — use validateSamplesSpec() at parse time for
 * teacher-friendly diagnostics.
 *
 * @param {string} spec - e.g. "x,y@-5,-10:5,10#11"
 * @returns {import('./types').SamplesSpec}
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
 * Validate a samples spec with detailed, teacher-friendly error messages.
 *
 * @param {string} spec
 * @returns {{ parsed: import('./types').SamplesSpec | null, errors: string[] }}
 */
export function validateSamplesSpec(spec) {
  const errors = [];

  if (!spec.includes('@')) {
    errors.push('samples: Missing "@" separator. Format is "variables@mins:maxs#count", e.g. "x@-5:5#10"');
    return { parsed: null, errors };
  }

  const [varPart, rest] = spec.split('@');
  const variables = varPart.split(',').map(s => s.trim()).filter(Boolean);

  if (variables.length === 0) {
    errors.push('samples: No variables found before "@". List variable names separated by commas, e.g. "x,y@..."');
    return { parsed: null, errors };
  }

  if (!rest || !rest.includes('#')) {
    errors.push('samples: Missing "#" separator for sample count. Format is "...@mins:maxs#count", e.g. "x@-5:5#10"');
    return { parsed: null, errors };
  }

  const [rangePart, countPart] = rest.split('#');
  const count = parseInt(countPart, 10);
  if (!Number.isInteger(count) || count <= 0) {
    errors.push(`samples: Sample count must be a positive integer, got "${countPart}".`);
  }

  if (!rangePart.includes(':')) {
    errors.push('samples: Missing ":" separator between min and max values. Format is "...@mins:maxs#count", e.g. "x@-5:5#10"');
    return { parsed: null, errors };
  }

  const [minsStr, maxsStr] = rangePart.split(':');
  const minStrs = minsStr.split(',');
  const maxStrs = maxsStr.split(',');

  if (minStrs.length !== variables.length) {
    errors.push(`samples: Found ${variables.length} variable(s) (${variables.join(', ')}) but ${minStrs.length} min value(s). Each variable needs its own min and max.`);
  }
  if (maxStrs.length !== variables.length) {
    errors.push(`samples: Found ${variables.length} variable(s) (${variables.join(', ')}) but ${maxStrs.length} max value(s). Each variable needs its own min and max.`);
  }

  if (errors.length > 0) return { parsed: null, errors };

  const mins = minStrs.map(Number);
  const maxs = maxsStr.split(',').map(Number);
  const ranges = {};

  for (let i = 0; i < variables.length; i++) {
    if (isNaN(mins[i])) {
      errors.push(`samples: "${minStrs[i].trim()}" is not a valid number in the min values.`);
    }
    if (isNaN(maxs[i])) {
      errors.push(`samples: "${maxStrs[i].trim()}" is not a valid number in the max values.`);
    }
    if (!isNaN(mins[i]) && !isNaN(maxs[i]) && mins[i] >= maxs[i]) {
      errors.push(`samples: Range for ${variables[i]} has min (${mins[i]}) >= max (${maxs[i]}). Did you swap them?`);
    }
    ranges[variables[i]] = [mins[i], maxs[i]];
  }

  if (errors.length > 0) return { parsed: null, errors };
  return { parsed: { variables, ranges, numSamples: count }, errors: [] };
}

/**
 * Generate random sample points within the variable hypercube.
 *
 * @param {import('./types').SamplesSpec} spec
 * @param {function} [rng] - random number generator (default: Math.random)
 * @returns {Record<string, number>[]}
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
 * Compare two values with relative tolerance.
 *
 * Tolerance is a ratio (default 0.00001 = 0.001%) multiplied by the larger
 * of the two magnitudes. This matches Open edX's compare_with_tolerance.
 *
 * @param {number|import('./complex').Complex} student
 * @param {number|import('./complex').Complex} instructor
 * @param {number} [tolerance] - relative tolerance ratio
 * @returns {boolean}
 */
function compareWithTolerance(student, instructor, tolerance = DEFAULT_TOLERANCE) {
  const sAbs = Complex.isComplex(student) ? student.abs() : Math.abs(student);
  const iAbs = Complex.isComplex(instructor) ? instructor.abs() : Math.abs(instructor);

  if (isNaN(sAbs) || isNaN(iAbs)) return false;
  if (!isFinite(sAbs) || !isFinite(iAbs)) return sAbs === iAbs;

  const tol = tolerance * Math.max(sAbs, iAbs);

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
 * @param {string} expected - correct formula (e.g. "x^2 - 1")
 * @param {string} given - student formula (e.g. "(x-1)*(x+1)")
 * @param {string} samples - sample spec (e.g. "x@-5:5#10")
 * @param {Object} [options]
 * @param {number} [options.tolerance] - relative tolerance ratio (default 0.001%)
 * @param {boolean} [options.caseSensitive]
 * @param {function} [options.rng] - random number generator (for determinism)
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
