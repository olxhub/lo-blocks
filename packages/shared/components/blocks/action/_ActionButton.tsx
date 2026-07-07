// packages/shared/components/blocks/action/_ActionButton.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

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

function ActionButton(props: RuntimeProps) {
  const { label, dependsOn, disabled: disabledAttr } = props;

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

  // Evaluate condition
  const isSatisfied = useMemo(() => {
    if (!ast) return true;
    try {
      const context = createContext(resolved);
      return Boolean(evaluate(ast, context));
    } catch (e) {
      console.warn('[ActionButton] Failed to evaluate dependsOn:', dependsOn, e);
      return false;
    }
  }, [ast, resolved, dependsOn]);

  // Disabled if: explicit attribute, OR dependsOn condition not satisfied
  const isDisabled = disabledAttr === 'true' || !isSatisfied;

  const { kids } = useKids(props);

  const onClick = () => executeNodeActions(props);
  return (
    <button onClick={onClick} disabled={isDisabled}>
      {label}
      {kids}
    </button>
  );
}

export default ActionButton;
