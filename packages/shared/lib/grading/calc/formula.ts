// packages/shared/lib/grading/calc/formula.ts — Sampling-based formula comparison.
//
// Evaluates student and instructor formulas at random sample points within
// a variable hypercube and checks that results agree within relative tolerance.
//
// SamplesSpec parsing, validation, and the zod schema live in schemas.ts —
// mathjs-free so blueprints can validate attributes at parse time without
// loading the math engine. Re-exported here for existing importers.

import { evaluator } from './index.js';
import { compareRelative } from './tolerance';
import { parseSamples } from './schemas';
import type { Complex } from 'mathjs';
import type { SamplesSpec } from './types';

export { validateSamplesSpec, parseSamples, SamplesSpecSchema } from './schemas';

const DEFAULT_TOLERANCE = 0.00001; // 0.001% as a ratio

// ═══════════════════════════════════════════════════════════════════════
// Formula comparison
// ═══════════════════════════════════════════════════════════════════════

/** Generate random sample points within the variable hypercube. */
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
 *
 * Accepts samples as a string (parsed internally) or a pre-parsed SamplesSpec.
 */
export function checkFormula(
  expected: string,
  given: string,
  samples: string | SamplesSpec,
  options: {
    tolerance?: number;
    caseSensitive?: boolean;
    rng?: () => number;
  } = {},
): { correct: boolean; error: string | null } {
  const { tolerance = DEFAULT_TOLERANCE, caseSensitive = false, rng = Math.random } = options;
  let spec: SamplesSpec;
  if (typeof samples === 'string') {
    try {
      spec = parseSamples(samples);
    } catch (e: any) {
      return { correct: false, error: e.message || 'Invalid samples specification' };
    }
  } else {
    spec = samples;
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
