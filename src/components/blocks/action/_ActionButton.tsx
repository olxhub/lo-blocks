// src/components/blocks/_ActionButton.tsx
'use client';

import React, { useMemo } from 'react';
import { executeNodeActions } from '@/lib/blocks';
import { useKids } from '@/lib/render';
import {
  parse,
  extractStructuredRefs,
  useReferences,
  evaluate,
  createContext,
  EMPTY_REFS
} from '@/lib/stateLanguage';

function _ActionButton(props) {
  const { label, dependsOn } = props;

  // Parse expression and extract refs once
  const { ast, refs } = useMemo(() => {
    if (!dependsOn) return { ast: null, refs: EMPTY_REFS };
    try {
      const ast = parse(dependsOn);
      const refs = extractStructuredRefs(dependsOn);
      return { ast, refs };
    } catch (e) {
      console.warn('[ActionButton] Failed to parse dependsOn:', dependsOn, e);
      return { ast: null, refs: EMPTY_REFS };
    }
  }, [dependsOn]);

  // Subscribe to all referenced values (stable hook call)
  const resolved = useReferences(props, refs);
  const context = createContext(resolved);

  // Evaluate condition
  const isSatisfied = useMemo(() => {
    if (!ast) return true;
    try {
      return Boolean(evaluate(ast, context));
    } catch (e) {
      console.warn('[ActionButton] Failed to evaluate dependsOn:', dependsOn, e);
      return false;
    }
  }, [ast, context, dependsOn]);

  const isDisabled = !isSatisfied;

  const { kids } = useKids(props);

  const onClick = () => executeNodeActions(props);
  return (
    <button onClick={onClick} disabled={isDisabled}>
      {label}
      {kids}
    </button>
  );
}

export default _ActionButton;
