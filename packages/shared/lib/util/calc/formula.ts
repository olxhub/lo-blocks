// calc/formula.ts — Sampling-based formula comparison.
//
// Evaluates student and instructor formulas at random sample points within
// a variable hypercube and checks that results agree within relative tolerance.
//
// Extracted from grader.js, now uses compareRelative from tolerance.ts.

import { evaluator } from './index.js';
import { compareRelative } from './tolerance';
import type { Complex } from 'mathjs';
import type { SamplesSpec } from './types';

const DEFAULT_TOLERANCE = 0.00001; // 0.001% as a ratio
const DEFAULT_NUM_SAMPLES = 10;

/**
 * Parse a samples spec string into a structured object.
 *
 * Assumes valid input — use validateSamplesSpec() at parse time for
 * teacher-friendly diagnostics.
 */
export function parseSamples(spec: string): SamplesSpec {
  const [varPart, rest] = spec.split('@');
  const variables = varPart.split(',').map(s => s.trim());
  let rangePart: string;
  let numSamples: number;
  if (rest.includes('#')) {
    const [rp, countPart] = rest.split('#');
    rangePart = rp;
    numSamples = parseInt(countPart, 10) || DEFAULT_NUM_SAMPLES;
  } else {
    rangePart = rest;
    numSamples = DEFAULT_NUM_SAMPLES;
  }
  const [minsStr, maxsStr] = rangePart.split(':');
  const mins = minsStr.split(',').map(Number);
  const maxs = maxsStr.split(',').map(Number);
  const ranges: Record<string, [number, number]> = {};
  variables.forEach((v, i) => { ranges[v] = [mins[i], maxs[i]]; });
  return { variables, ranges, numSamples };
}

/**
 * Generate random sample points within the variable hypercube.
 */
function randomizeVariables(
  { ranges, numSamples }: SamplesSpec,
  rng: () => number = Math.random,
): Record<string, number>[] {
  const vars = Object.keys(ranges);
  const out: Record<string, number>[] = [];
  for (let i = 0; i < numSamples; i++) {
    const dict: Record<string, number> = {};
    for (const v of vars) {
      const [lo, hi] = ranges[v];
      dict[v] = lo + rng() * (hi - lo);
    }
    out.push(dict);
  }
  return out;
}

/**
 * Check if a student formula is equivalent to an expected formula
 * by evaluating both at random sample points.
 */
export function checkFormula(
  expected: string,
  given: string,
  samples: string,
  options: {
    tolerance?: number;
    caseSensitive?: boolean;
    rng?: () => number;
  } = {},
): { correct: boolean; error: string | null } {
  const { tolerance = DEFAULT_TOLERANCE, caseSensitive = false, rng = Math.random } = options;
  let spec: SamplesSpec;
  try {
    spec = parseSamples(samples);
  } catch {
    return { correct: false, error: 'Invalid samples specification' };
  }
  if (!Number.isInteger(spec.numSamples) || spec.numSamples <= 0) {
    return { correct: false, error: 'Sample count must be a positive integer' };
  }
  const varDicts = randomizeVariables(spec, rng);
  const evalOpts = { caseSensitive };

  let studentResults: (number | Complex)[];
  let instructorResults: (number | Complex)[];
  try {
    instructorResults = varDicts.map(v => evaluator(v, {}, expected, evalOpts));
  } catch (e: any) {
    return { correct: false, error: `Error in expected answer: ${e.message}` };
  }
  try {
    studentResults = varDicts.map(v => evaluator(v, {}, given, evalOpts));
  } catch (e: any) {
    return { correct: false, error: e.message };
  }

  const correct = studentResults.every((s, i) =>
    compareRelative(s, instructorResults[i], tolerance)
  );
  return { correct, error: null };
}
