'use client';

import { useMemo } from 'react';
import { useTextContent } from '@/lib/state/redux';
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

export type TextTemplateMode = 'none' | 'state';

export type UseTextResult = BlockDataResult & {
  text: string;
};

function HACK_capaProblemTextKidsWorkaround(kids: unknown[]): string {
  // CapaProblem can bypass the normal text-parser contract and pass Markdown
  // an array of KidEntry text nodes instead of the string parsers.text()
  // promises. Remove this when CapaProblem consistently runs child parsers.
  return kids
    .map(kid => {
      if (typeof kid !== 'object' || kid === null || !('type' in kid) || !('text' in kid)) return '';
      return kid.type === 'text' && typeof kid.text === 'string' ? kid.text : '';
    })
    .join('');
}

function textFromKids(kids: unknown): string {
  if (typeof kids === 'string') return kids;
  if (Array.isArray(kids)) return HACK_capaProblemTextKidsWorkaround(kids);
  return '';
}

function renderStateTemplate(
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
      console.warn('[useText] Failed to evaluate:', expression, error);
      value = `{{${expression}}}`;
    }
    result = result.slice(0, start) + value + result.slice(end);
  }

  return result;
}

/**
 * Return a block's source text without exposing where it came from.
 *
 * The parser/blueprint declares the source policy and default template
 * language. This hook owns the runtime portion: target/value resolution,
 * subscriptions, and template evaluation. Its internal hooks are called in a
 * fixed order even when Studio changes `template` between renders.
 */
export function useText(props: RuntimeProps): UseTextResult {
  const fallback = textFromKids(props.kids);
  // Called unconditionally so the hook order remains stable. Plain text
  // parsers use authored kids; withTarget parsers select the resolved value.
  const valueSource = useTextContent(props, { fallback });
  const source = props.loBlock?.textContent?.source === 'value'
    ? valueSource
    : { text: fallback, loading: false, error: null, ready: true };
  const status = source.error ? 'error' : source.loading ? 'loading' : 'ready';
  const mode: TextTemplateMode = props.template
    ?? props.loBlock?.textContent?.defaultTemplate
    ?? 'none';

  const { interpolations, refs } = useMemo<{
    interpolations: Interpolation[];
    refs: References;
  }>(() => {
    if (mode !== 'state') return { interpolations: [], refs: EMPTY_REFS };
    return {
      interpolations: extractInterpolations(source.text),
      refs: extractInterpolationRefs(source.text),
    };
  }, [mode, source.text]);

  // Unconditional for hook-order stability. EMPTY_REFS is the no-template
  // fast path and subscribes to no referenced block fields.
  const resolved = useReferences(props, refs);

  const text = useMemo(() => {
    if (mode !== 'state' || interpolations.length === 0) return source.text;
    return renderStateTemplate(source.text, interpolations, resolved);
  }, [mode, source.text, interpolations, resolved]);

  return { ...source, status, text };
}
