'use client';

import { useMemo } from 'react';
import type { TextTemplateMode } from '@/lib/blocks/attributeSchemas';
import { useValue } from '@/lib/state/fieldHooks';
import {
  EMPTY_REFS,
  createContext,
  evaluate,
  extractInterpolationRefs,
  extractInterpolations,
  parse,
  useReferences,
} from '@/lib/stateLanguage';
import type { ContextData, Interpolation, References } from '@/lib/stateLanguage';
import type { BlockDataResult, RuntimeProps } from '@/lib/types';
import { parseAnyStateRef } from '@/lib/types/id-grammar';

export type UseTextResult = BlockDataResult & { text: string };

function textFromKids(kids: unknown): string {
  return typeof kids === 'string' ? kids : '';
}

function readyText(text: string): UseTextResult {
  return {
    text,
    status: 'ready',
    loading: false,
    error: null,
    ready: true,
  };
}

function textFromValue(
  result: BlockDataResult & { value: unknown },
  fallback: string,
): UseTextResult {
  const text = typeof result.value === 'string'
    ? result.value
    : result.value == null
      ? fallback
      : String(result.value);

  // A real inline fallback recovers a failed target. Without one, preserve
  // the error so the renderer reports the source failure instead of "empty".
  if (result.status === 'error' && fallback.trim()) return readyText(fallback);
  return { ...result, text };
}

function interpolateStateTemplate(
  text: string,
  interpolations: Interpolation[],
  context: ContextData,
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
      console.warn('[useInterpolation] Failed to evaluate:', expression, error);
      value = `{{${expression}}}`;
    }
    result = result.slice(0, start) + value + result.slice(end);
  }

  return result;
}

/** Resolve parsed text, including an optional reactive `target=` source. */
export function useText(
  props: RuntimeProps,
  fallback: string = textFromKids(props.kids),
): UseTextResult {
  const readsValue = props.loBlock?.textContent?.source === 'value';
  const target = readsValue && typeof props.target === 'string'
    ? parseAnyStateRef(props.target)
    : undefined;

  // Keep hook order stable while avoiding a Redux subscription for kids-only
  // blocks. stateKey:null makes useValue return the fallback directly.
  const valueResult = useValue(props, {
    stateKey: readsValue ? undefined : null,
    target,
    fallback,
  });

  return readsValue ? textFromValue(valueResult, fallback) : readyText(fallback);
}

/** Evaluate already-resolved text using the block's selected template mode. */
export function useInterpolation(
  props: RuntimeProps,
  text: string,
  mode: TextTemplateMode = props.template
    ?? props.loBlock?.textContent?.defaultTemplateMode
    ?? 'none',
): string {
  const { interpolations, refs } = useMemo<{
    interpolations: Interpolation[];
    refs: References;
  }>(() => {
    if (mode !== 'state') return { interpolations: [], refs: EMPTY_REFS };
    return {
      interpolations: extractInterpolations(text),
      refs: extractInterpolationRefs(text),
    };
  }, [mode, text]);

  // EMPTY_REFS is the literal fast path and subscribes to no block fields.
  // TODO(template-loading): useReferences does not expose dependency loading
  // or errors. Resolve that once the platform-wide dependency API settles;
  // Markdown already has this limitation today.
  const resolved = useReferences(props, refs);

  return useMemo(() => {
    if (mode !== 'state' || interpolations.length === 0) return text;
    return interpolateStateTemplate(text, interpolations, resolved);
  }, [mode, text, interpolations, resolved]);
}

/**
 * Evaluate the author-provided template, then let a runtime value override it.
 *
 * This ordering is intentional: kids (including parse-time `src=` content)
 * may contain templates; `target=` and writable block values are data and are
 * never scanned for expressions. Runtime templates are deliberately
 * unsupported for now. If needed, add an explicit mode such as
 * `template="state:withValue"` rather than broadening `template="state"`.
 */
export function useTextWithTemplate(props: RuntimeProps): UseTextResult {
  const authoredText = useInterpolation(props, textFromKids(props.kids));
  return useText(props, authoredText);
}
