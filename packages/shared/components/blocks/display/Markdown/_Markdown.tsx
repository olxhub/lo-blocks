'use client';
import React, { useMemo } from 'react';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import type { RuntimeProps } from '@/lib/types';
import { useTextContent } from '@/lib/state/redux';
import Spinner from '@/components/common/Spinner';
import {
  extractInterpolations,
  extractInterpolationRefs,
  useReferences,
  parse,
  evaluate,
  createContext,
} from '@/lib/stateLanguage';

export default function Markdown(props: RuntimeProps) {
  const { text: content, loading } = useTextContent(props);

  // Extract all {{...}} interpolations and their references
  const { interpolations, refs } = useMemo(() => {
    if (typeof content !== 'string') return { interpolations: [], refs: { componentState: [], olxContent: [], globalVar: [] } };
    const interpolations = extractInterpolations(content);
    const refs = extractInterpolationRefs(content);
    return { interpolations, refs };
  }, [content]);

  // Subscribe to all referenced values
  const resolved = useReferences(props, refs);

  // Replace interpolations with evaluated values
  const resolvedContent = useMemo(() => {
    if (typeof content !== 'string' || interpolations.length === 0) return content;

    const evalContext = createContext(resolved);
    let result = content;

    // Process in reverse order to preserve string positions
    for (let i = interpolations.length - 1; i >= 0; i--) {
      const { expression, start, end } = interpolations[i];
      let value = '';
      try {
        const ast = parse(expression);
        const evaluated = evaluate(ast, evalContext);
        if (evaluated !== null && evaluated !== undefined) {
          value = typeof evaluated === 'object' ? JSON.stringify(evaluated) : String(evaluated);
        }
      } catch (e) {
        console.warn('[Markdown] Failed to evaluate:', expression, e);
        value = `{{${expression}}}`; // Keep original on error
      }
      result = result.slice(0, start) + value + result.slice(end);
    }

    return result;
  }, [content, interpolations, resolved]);

  if (loading) {
    return <Spinner />;
  }

  // ns: embedded ```olx fences parse in this block's own namespace, so
  // they can reference sibling content with bare refs.
  return <RenderMarkdown ns={props.runtime.ns}>{resolvedContent as string}</RenderMarkdown>;
}
