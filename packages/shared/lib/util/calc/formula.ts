// packages/shared/lib/util/calc/formula.ts — Sampling-based formula comparison.
//
// Evaluates student and instructor formulas at random sample points within
// a variable hypercube and checks that results agree within relative tolerance.
//
// Also handles SamplesSpec parsing and validation, since samples specs
// are specific to formula grading.

import { z } from 'zod';
import { evaluator, DEFAULT_VARIABLES, DEFAULT_FUNCTIONS } from './index.js';
import { compareRelative } from './tolerance';
import type { Complex } from 'mathjs';
import type { SamplesSpec } from './types';

const DEFAULT_TOLERANCE = 0.00001; // 0.001% as a ratio
const DEFAULT_NUM_SAMPLES = 10;
const MAX_NUM_SAMPLES = 200;

// ═══════════════════════════════════════════════════════════════════════
// Samples spec: internal split
// ═══════════════════════════════════════════════════════════════════════

/** Internal: split a samples spec string into raw parts. */
function _splitSamples(spec: string): {
  variables: string[];
  mins: number[];
  maxs: number[];
  numSamples: number;
  rawMins: string[];
  rawMaxs: string[];
  rawCount: string | undefined;
} {
  const [varPart, rest] = spec.split('@');
  const variables = varPart.split(',').map(s => s.trim()).filter(Boolean);
  let rangePart: string;
  let numSamples: number;
  let rawCount: string | undefined;
  if (rest.includes('#')) {
    const [rp, cs] = rest.split('#');
    rangePart = rp;
    rawCount = cs;
    numSamples = parseInt(cs, 10);
    if (isNaN(numSamples)) numSamples = DEFAULT_NUM_SAMPLES;
  } else {
    rangePart = rest;
    numSamples = DEFAULT_NUM_SAMPLES;
  }
  const [minsStr, maxsStr] = rangePart.split(':');
  const rawMins = minsStr.split(',');
  const rawMaxs = maxsStr.split(',');
  return {
    variables,
    mins: rawMins.map(Number),
    maxs: rawMaxs.map(Number),
    numSamples,
    rawMins,
    rawMaxs,
    rawCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Samples spec: small validators
// ═══════════════════════════════════════════════════════════════════════

function validateSampleCount(count: number, raw?: string): string | undefined {
  if (!Number.isInteger(count) || count <= 0) {
    return `samples: Sample count must be a positive integer, got "${raw ?? count}".`;
  }
  if (count > MAX_NUM_SAMPLES) {
    return `samples: Sample count ${count} exceeds maximum of ${MAX_NUM_SAMPLES}.`;
  }
  return undefined;
}

// TODO: Allow a flag to permit built-in overrides when course team need arrives
const BUILTIN_VAR_NAMES = new Set(Object.keys(DEFAULT_VARIABLES).map(k => k.toLowerCase()));
const BUILTIN_FUNC_NAMES = new Set(Object.keys(DEFAULT_FUNCTIONS).map(k => k.toLowerCase()));

function validateVariableNames(variables: string[]): string[] {
  const errors: string[] = [];
  for (const v of variables) {
    if (BUILTIN_VAR_NAMES.has(v.toLowerCase())) {
      errors.push(
        `samples: Variable "${v}" shadows the built-in constant "${v.toLowerCase()}". ` +
        `This would override its value during evaluation. ` +
        `If you meant to do this, please contact the development team.`
      );
    }
    if (BUILTIN_FUNC_NAMES.has(v.toLowerCase())) {
      errors.push(
        `samples: Variable "${v}" conflicts with the built-in function "${v.toLowerCase()}". ` +
        `If you meant to do this, please contact the development team.`
      );
    }
  }
  return errors;
}

function validateRangeValues(
  variables: string[],
  mins: number[],
  maxs: number[],
  rawMins: string[],
  rawMaxs: string[],
): string[] {
  const errors: string[] = [];
  if (mins.length !== variables.length) {
    errors.push(
      `samples: Found ${variables.length} variable(s) (${variables.join(', ')}) ` +
      `but ${mins.length} min value(s). Each variable needs its own min and max.`
    );
  }
  if (maxs.length !== variables.length) {
    errors.push(
      `samples: Found ${variables.length} variable(s) (${variables.join(', ')}) ` +
      `but ${maxs.length} max value(s). Each variable needs its own min and max.`
    );
  }
  if (errors.length > 0) return errors;

  for (let i = 0; i < variables.length; i++) {
    if (isNaN(mins[i])) {
      errors.push(`samples: "${rawMins[i].trim()}" is not a valid number in the min values.`);
    }
    if (isNaN(maxs[i])) {
      errors.push(`samples: "${rawMaxs[i].trim()}" is not a valid number in the max values.`);
    }
    if (!isNaN(mins[i]) && !isNaN(maxs[i]) && mins[i] >= maxs[i]) {
      errors.push(
        `samples: Range for ${variables[i]} has min (${mins[i]}) >= max (${maxs[i]}). Did you swap them?`
      );
    }
  }
  return errors;
}

// ═══════════════════════════════════════════════════════════════════════
// Samples spec: public API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate a samples spec string like "x@-5:5#11" or "x,y@-5,-10:5,10#11".
 * Returns the parsed spec and any errors (collects all errors for teacher diagnostics).
 */
export function validateSamplesSpec(spec: string): { parsed: SamplesSpec | null; errors: string[] } {
  // Structural checks (before parsing)
  if (!spec.includes('@')) {
    return {
      parsed: null,
      errors: ['samples: Missing "@" separator. Format is "x@-5:5#10" or "x,y@-5,-5:10,10#10"'],
    };
  }
  const [, rest] = spec.split('@');
  const rangePart = rest.includes('#') ? rest.split('#')[0] : rest;
  if (!rangePart.includes(':')) {
    return {
      parsed: null,
      errors: ['samples: Missing ":" separator between min and max values. Format is "x@-5:5#10" or "x,y@-5,-5:10,10#10"'],
    };
  }

  // Parse
  const raw = _splitSamples(spec);

  if (raw.variables.length === 0) {
    return {
      parsed: null,
      errors: ['samples: No variables found before "@". List variable names separated by commas, e.g. "x,y@..."'],
    };
  }

  // Semantic validation
  const errors: string[] = [];

  const countError = validateSampleCount(raw.numSamples, raw.rawCount);
  if (countError) errors.push(countError);

  errors.push(...validateVariableNames(raw.variables));
  errors.push(...validateRangeValues(raw.variables, raw.mins, raw.maxs, raw.rawMins, raw.rawMaxs));

  if (errors.length > 0) return { parsed: null, errors };

  // Build validated SamplesSpec
  const ranges: Record<string, [number, number]> = {};
  for (let i = 0; i < raw.variables.length; i++) {
    ranges[raw.variables[i]] = [raw.mins[i], raw.maxs[i]];
  }
  return {
    parsed: { variables: raw.variables, ranges, numSamples: raw.numSamples },
    errors: [],
  };
}

/**
 * Parse a samples spec string into a structured object.
 * Validates and throws on the first error.
 */
export function parseSamples(spec: string): SamplesSpec {
  const { parsed, errors } = validateSamplesSpec(spec);
  if (errors.length > 0) throw new Error(errors[0]);
  return parsed!;
}

// ═══════════════════════════════════════════════════════════════════════
// Samples spec: Zod schema
// ═══════════════════════════════════════════════════════════════════════

/** Zod object schema matching the SamplesSpec interface. */
const SamplesSpecObject = z.object({
  variables: z.array(z.string()),
  ranges: z.record(z.string(), z.tuple([z.number(), z.number()])),
  numSamples: z.number().int().positive(),
});

/**
 * Zod schema for samples specifications. Idempotent:
 * - String input (e.g. "x@-5:5#10"): parsed and validated into SamplesSpec
 * - SamplesSpec object: passed through unchanged
 *
 * Use as `SamplesSpecSchema.optional()` in grader attribute definitions.
 */
export const SamplesSpecSchema = z.union([
  z.string().transform((spec, ctx) => {
    const { parsed, errors } = validateSamplesSpec(spec);
    if (errors.length > 0) {
      for (const err of errors) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
      }
      return z.NEVER;
    }
    return parsed!;
  }),
  SamplesSpecObject,
]);

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
