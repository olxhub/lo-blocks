// calc/validators.ts — Composable validation functions.
//
// Each validator answers "is this string a valid X?" and returns an error
// message or undefined. General-purpose: usable from zod schemas, CSV
// imports, real-time input components, or grading frameworks.

import { parseComplex, parseRange } from './parse';
import { evaluator, DEFAULT_VARIABLES, DEFAULT_FUNCTIONS } from './index.js';
import type { SamplesSpec } from './types';

/**
 * Validate a tolerance string.
 * Accepts absolute numbers ("0.01"), percentages ("5%"), and empty/undefined.
 */
export function validateTolerance(tolerance: string | undefined): string | undefined {
  if (tolerance === undefined || tolerance === '') return undefined;
  const s = String(tolerance).trim();
  if (s.endsWith('%')) {
    const p = parseFloat(s.slice(0, -1));
    if (isNaN(p)) return `tolerance: "${tolerance}" is not a valid percentage.`;
    return undefined;
  }
  const n = parseFloat(s);
  if (isNaN(n) || n < 0) return `tolerance: "${tolerance}" is not a valid non-negative number.`;
  return undefined;
}

/**
 * Validate that a value is a parseable number or complex.
 */
export function validateNumber(value: unknown): string | undefined {
  const parsed = parseComplex(value);
  if (isNaN(parsed.re) || isNaN(parsed.im)) {
    return `"${value}" is not a valid number.`;
  }
  return undefined;
}

/**
 * Validate a range string like "[0, 10]" or "(0, 10)".
 * Returns error messages or undefined if valid.
 */
export function validateRange(str: string): string[] | undefined {
  const range = parseRange(str);
  if (!range) {
    return [`Invalid range format "${str}". Expected format like "[0, 10]" or "(0, 10)".`];
  }
  const errors: string[] = [];
  if (isNaN(range.lower.re) || isNaN(range.lower.im)) {
    errors.push(`Invalid lower bound in range "${str}".`);
  }
  if (isNaN(range.upper.re) || isNaN(range.upper.im)) {
    errors.push(`Invalid upper bound in range "${str}".`);
  }
  return errors.length > 0 ? errors : undefined;
}

/**
 * Validate that a string is a parseable math expression.
 * Optionally restricts to allowed variables (e.g. from a samples spec).
 */
export function validateFormula(
  expr: string,
  options?: {
    allowedVariables?: Record<string, number>;
    caseSensitive?: boolean;
  },
): string | undefined {
  if (typeof expr !== 'string') return 'Expected a string';
  try {
    evaluator(options?.allowedVariables ?? {}, {}, expr, {
      caseSensitive: options?.caseSensitive ?? false,
    });
    return undefined;
  } catch (e: any) {
    // UndefinedVariable is only an error if we're checking variables
    if (e.name === 'UndefinedVariable' && !options?.allowedVariables) return undefined;
    // ZeroDivisionError / ValueError aren't syntax errors — the formula is valid
    if (e.name === 'ZeroDivisionError' || e.name === 'ValueError') return undefined;
    return e.message || 'Invalid expression';
  }
}

/**
 * Validate a samples spec string like "x,y@-5,-10:5,10#11".
 * Returns the parsed spec and any errors.
 */
export function validateSamplesSpec(spec: string): { parsed: SamplesSpec | null; errors: string[] } {
  const errors: string[] = [];

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
  const ranges: Record<string, [number, number]> = {};

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
