// calc/formula.ts — Sampling-based formula comparison.
//
// Evaluates student and instructor formulas at random sample points within
// a variable hypercube and checks that results agree within relative tolerance.
//
// Extracted from grader.js, now uses compareRelative from tolerance.ts.

import { evaluator } from './index.js';
import { compareRelative } from './tolerance';
import type { SamplesSpec } from './types';

const DEFAULT_TOLERANCE = 0.00001; // 0.001% as a ratio

/**
 * Parse a samples spec string into a structured object.
 *
 * Assumes valid input — use validateSamplesSpec() at parse time for
 * teacher-friendly diagnostics.
 */
export function parseSamples(spec: string): SamplesSpec {
  const [varPart, rest] = spec.split('@');
  const variables = varPart.split(',').map(s => s.trim());
  const [rangePart, countPart] = rest.split('#');
  const numSamples = parseInt(countPart, 10);
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
  const spec = parseSamples(samples);
  const varDicts = randomizeVariables(spec, rng);
  const evalOpts = { caseSensitive };

  let studentResults: any[];
  let instructorResults: any[];
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
