// packages/shared/lib/grading/calc/schemas.ts — Attribute schemas and pure
// validation for math grading, WITHOUT the math engine.
//
// mathjs-free on purpose: these zod schemas validate grader attributes
// (tolerance="5%", samples="x@-5:5#10") at OLX parse time, so they load
// eagerly with the FormulaGrader/NumericalGrader/RatioGrader blueprints —
// in every node script and server process, whether or not any course uses
// math. Everything that touches mathjs (evaluation, complex numbers,
// comparison) lives in the rest of calc/ and loads lazily at first grading
// use (see lib/grading/calcLoader.ts).
//
// Validation here is complete, not a weaker first pass: tolerance and
// samples specs are string formats whose full semantics are checkable with
// string/number logic. Authors get their errors at parse time as before.

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════
// Built-in names — the contract between validation and the math engine
// ═══════════════════════════════════════════════════════════════════════
//
// Samples validation must reject variables that shadow built-ins (defining
// samples for "pi" would silently override the constant during
// evaluation). The implementations live in functions.js, which is
// mathjs-coupled — so the NAMES are declared here as the canonical
// contract, and functions.js asserts at its own load time that its
// implementation keys match these lists exactly. Drift fails fast the
// first time the engine loads (every calc test does).

export const BUILTIN_VARIABLE_NAMES = ['i', 'j', 'e', 'pi'] as const;
export const BUILTIN_FUNCTION_NAMES = [
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'arcsin', 'arccos', 'arctan', 'arcsec', 'arccsc', 'arccot',
  'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth',
  'arcsinh', 'arccosh', 'arctanh', 'arcsech', 'arccsch', 'arccoth',
  'sqrt', 'log10', 'log2', 'ln', 'exp',
  'abs',
  'fact', 'factorial',
] as const;

const BUILTIN_VAR_NAMES = new Set<string>(BUILTIN_VARIABLE_NAMES.map(k => k.toLowerCase()));
const BUILTIN_FUNC_NAMES = new Set<string>(BUILTIN_FUNCTION_NAMES.map(k => k.toLowerCase()));

// ═══════════════════════════════════════════════════════════════════════
// Tolerance — branded type, schema, parsing
// ═══════════════════════════════════════════════════════════════════════

/** Branded type: a validated tolerance string (e.g., "0.01", "5%"). */
export type Tolerance = string & { __brand: 'Tolerance' };

/**
 * Parse a tolerance string into an absolute numeric tolerance.
 *
 * Validates and throws on invalid input. Accepts:
 * - Numbers: 0.01 (pass-through)
 * - Absolute strings: "0.01"
 * - Percentage strings: "5%" (resolved against `base`, e.g. 5% of 200 = 10)
 *
 * Callers must handle optionality before calling (i.e. don't pass undefined).
 */
export function parseTolerance(tol: string | number, base: number = 0): number {
  if (typeof tol === 'number') {
    if (isNaN(tol)) throw new Error('tolerance: NaN is not a valid tolerance.');
    if (tol < 0) throw new Error(`tolerance: ${tol} is not a valid non-negative number.`);
    return tol;
  }
  const s = String(tol).trim();
  if (s === '') throw new Error('tolerance: empty string is not a valid tolerance.');
  if (s.endsWith('%')) {
    const p = parseFloat(s.slice(0, -1));
    if (isNaN(p)) throw new Error(`tolerance: "${tol}" is not a valid percentage.`);
    if (p < 0) throw new Error(`tolerance: "${tol}" is not a valid non-negative number.`);
    if (isNaN(base)) base = 0;
    return p / 100 * base;
  }
  const n = parseFloat(s);
  if (isNaN(n)) throw new Error(`tolerance: "${tol}" is not a valid non-negative number.`);
  if (n < 0) throw new Error(`tolerance: "${tol}" is not a valid non-negative number.`);
  return n;
}

/**
 * Validate a tolerance string (non-throwing, for form validation).
 * Returns an error message or undefined if valid.
 * Accepts undefined/empty as valid (tolerance is optional in most contexts).
 */
export function validateTolerance(tolerance: string | undefined): string | undefined {
  if (tolerance === undefined || tolerance === '') return undefined;
  try {
    parseTolerance(tolerance, 1);
    return undefined;
  } catch (e: any) {
    return e.message;
  }
}

/**
 * Zod schema for tolerance strings. Validates format, returns branded string.
 * Idempotent: accepts already-branded Tolerance values unchanged (still strings at runtime).
 *
 * Use as `ToleranceSchema.optional()` in grader attribute definitions.
 */
export const ToleranceSchema = z.string()
  .superRefine((val, ctx) => {
    try {
      parseTolerance(val, 1);
    } catch (e: any) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: e.message });
    }
  })
  .transform(s => s as Tolerance);

// ═══════════════════════════════════════════════════════════════════════
// Samples spec — parsing, validation, schema
// ═══════════════════════════════════════════════════════════════════════

import type { SamplesSpec } from './types';

const DEFAULT_NUM_SAMPLES = 10;
const MAX_NUM_SAMPLES = 200;

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
