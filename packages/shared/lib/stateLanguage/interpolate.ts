// packages/shared/lib/stateLanguage/interpolate.ts
//
// Pure state-template interpolation. Callers choose how evaluation failures
// are reported while this module owns the shared substitution semantics.

import { createContext, evaluate } from './evaluate';
import { parse } from './parser';
import type { ContextData } from './evaluate';
import type { Interpolation } from './references';

export type InterpolationErrorHandler = (
  expression: string,
  error: unknown,
) => void;

/** Evaluate parsed state-template interpolations against one state snapshot. */
export function interpolateStateTemplate(
  text: string,
  interpolations: Interpolation[],
  context: Partial<ContextData>,
  onError?: InterpolationErrorHandler,
): string {
  let result = text;
  const evalContext = createContext(context);

  // Work backwards so replacements do not invalidate earlier offsets.
  for (let i = interpolations.length - 1; i >= 0; i--) {
    const { expression, start, end } = interpolations[i];
    let value = '';
    try {
      const evaluated = evaluate(parse(expression), evalContext);
      if (evaluated !== null && evaluated !== undefined) {
        value = typeof evaluated === 'object'
          ? JSON.stringify(evaluated)
          : String(evaluated);
      }
    } catch (error) {
      onError?.(expression, error);
      value = `{{${expression}}}`;
    }
    result = result.slice(0, start) + value + result.slice(end);
  }

  return result;
}
