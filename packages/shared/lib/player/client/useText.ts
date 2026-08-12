'use client';

import { useMemo } from 'react';
import type { TextTemplateMode } from '@/lib/blocks/attributeSchemas';
import { useValue } from '@/lib/state/fieldHooks';
import {
  EMPTY_REFS,
  extractInterpolationRefs,
  extractInterpolations,
  interpolateStateTemplate,
  useReferences,
} from '@/lib/stateLanguage';
import type { Interpolation, References } from '@/lib/stateLanguage';
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

function reportInterpolationError(expression: string, error: unknown): void {
  console.warn('[useInterpolation] Failed to evaluate:', expression, error);
}

/** Resolve parsed text, including an optional reactive `target=` source. */
export function useText(
  props: RuntimeProps,
  fallback: string = textFromKids(props.kids),
): UseTextResult {
  const parsedText = textFromKids(props.kids);
  const readsValue = props.loBlock?.textContent?.source === 'value';
  const hasTarget = readsValue && typeof props.target === 'string';
  const target = hasTarget
    ? parseAnyStateRef(props.target)
    : undefined;

  // Keep hook order stable while avoiding a Redux subscription for kids-only
  // blocks. stateKey:null makes useValue return the fallback directly.
  const valueResult = useValue(props, {
    stateKey: readsValue ? undefined : null,
    target,
    fallback,
  });

  if (!readsValue) return readyText(fallback);

  // The targetable-text value selector exposes parsed kids as the block's
  // observable value until something is written. It cannot see this hook's
  // evaluated author fallback. Substitute that fallback only for an own-value
  // read which yielded the exact parsed source. Explicit targets are runtime
  // data even when their text happens to equal our fallback. An own-value
  // write byte-identical to the parsed source is currently indistinguishable
  // from "unwritten" and receives the same authored-template rendering. No
  // runtime string is scanned, but parse-time compiled templates should
  // eventually remove this provenance ambiguity.
  const resolvedValue = !hasTarget && valueResult.value === parsedText
    ? { ...valueResult, value: fallback }
    : valueResult;

  return textFromValue(resolvedValue, fallback);
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
    return interpolateStateTemplate(text, interpolations, resolved, reportInterpolationError);
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
