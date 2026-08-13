'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect } from 'react';
import { executeNodeActions } from '@/lib/blocks';
import { useReferences } from '@/lib/stateLanguage/hooks';
import { extractStructuredRefs } from '@/lib/stateLanguage/references';
import { evaluate, createContext } from '@/lib/stateLanguage/evaluate';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/player/client/render';
import { DisplayError } from '@/lib/util/debug';

function _OnChange(props: RuntimeProps) {
  const { watch } = props;

  // Children join the OlxDom so executeNodeActions can find them, as in Trigger.
  useKids(props);
  const [prevValue, setPrevValue] = useFieldState(props, props.fields.prevValue, '');

  const { expr, ast } = watch;
  const refs = extractStructuredRefs(expr);
  const resolved = useReferences(props, refs);

  let value: unknown;
  let evalError: unknown = null;
  try {
    value = evaluate(ast, createContext(resolved));
  } catch (e) {
    evalError = e;
  }

  // Compared as a string so an object-valued watch (a published sheet is JSON)
  // is diffed by content rather than by identity, which changes every render.
  const serialised =
    value === undefined || value === null ? '' : String(
      typeof value === 'object' ? JSON.stringify(value) : value
    );

  useEffect(() => {
    if (evalError) return;
    // Nothing to act on yet. Firing on the empty first render would grade a
    // screen the student has not reached, and the value it would record as
    // "seen" would suppress the first real change.
    if (!serialised) return;
    if (serialised === prevValue) return;
    setPrevValue(serialised);
    if (props.runtime.sideEffectFree) return;
    executeNodeActions(props);
    // The actions this fires must not alter the watched value, or it would
    // re-fire forever. A grader writes correct/score/submitCount on ITSELF, so
    // watching the sheet it reads is safe.
  }, [serialised, prevValue, setPrevValue, evalError]);

  if (evalError) {
    return <DisplayError
      props={props}
      title="OnChange"
      message={`Failed to evaluate watch expression: ${expr}`}
      technical={evalError}
    />;
  }

  return null;
}

export default _OnChange;
