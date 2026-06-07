'use client';
import { useMemo } from 'react';
import RenderMarkdown, { markdownComponents } from '@/components/common/RenderMarkdown';
import type { RuntimeProps } from '@/lib/types';
import { isKidArray } from '@/lib/util/kids';
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

// Re-export for backwards compatibility
export { markdownComponents };

export function _Markdown(props: RuntimeProps) {
  let { text: content, loading } = useTextContent(props);

  /*** HACK HACK HACK ***/
  // This works around a bug where CapaProblem doesn't use block parsers correctly
  if (!content && isKidArray(props.kids) && props.kids.length > 0) {
    content = props.kids.map((kid) => {
      if (kid.type === 'text') {
        return kid.text;
      }
      return '';
    }).join('');
  }
  /*** end of hack ***/

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

  return <RenderMarkdown>{resolvedContent as string}</RenderMarkdown>;
}
