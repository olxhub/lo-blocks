// _Trigger - fires related actions when a DSL expression becomes true.
//
// Edge-triggered: fires on false→true transitions, not while true.
// mode="once" (default): fires once, persists across remounts.
// mode="each": fires every time the expression transitions to true.

'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect } from 'react';
import { executeNodeActions } from '@/lib/blocks';
import { useReferences } from '@/lib/stateLanguage/hooks';
import { extractStructuredRefs } from '@/lib/stateLanguage/references';
import { evaluate, createContext } from '@/lib/stateLanguage/evaluate';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

function _Trigger(props: RuntimeProps) {
  const { watch, mode = 'once' } = props;

  // Add triggered actions to the OlxDom so executeNodeActions can find them.
  // E.g. <Trigger><Flash/><SetFieldAction/></Trigger> needs those in the DOM.
  useKids(props);
  const [hasTriggered, setHasTriggered] = useFieldState(props, props.fields.hasTriggered, false);
  const [prevValue, setPrevValue] = useFieldState(props, props.fields.prevValue, false);

  // watch is pre-parsed by z_expression into { expr, ast }
  const { expr, ast } = watch;
  const refs = extractStructuredRefs(expr);

  // Subscribe to all referenced values
  const resolved = useReferences(props, refs);

  // Evaluate expression — re-computes each render when resolved values change
  let isTrue = false;
  let evalError: unknown = null;
  try {
    isTrue = Boolean(evaluate(ast, createContext(resolved)));
  } catch (e) {
    evalError = e;
  }

  useEffect(() => {
    if (evalError) return;

    const wasTrue = prevValue;

    // Always track current value
    if (isTrue !== wasTrue) {
      setPrevValue(isTrue);
    }

    // Edge-trigger: fire only on false→true transition
    if (wasTrue || !isTrue) return;
    if (props.runtime.sideEffectFree) return;

    // In "once" mode, skip if already triggered
    if (mode === 'once' && hasTriggered) return;

    executeNodeActions(props);

    if (mode === 'once') {
      setHasTriggered(true);
    }
  }, [isTrue, mode, hasTriggered, prevValue, setHasTriggered, setPrevValue, evalError]);

  // Expression parsed but failed at runtime — e.g. referencing a nonexistent block or field.
  if (evalError) {
    return <DisplayError
      props={props}
      name="Trigger"
      message={`Failed to evaluate watch expression: ${expr}`}
      technical={evalError}
    />;
  }

  return null;
}

export default _Trigger;
