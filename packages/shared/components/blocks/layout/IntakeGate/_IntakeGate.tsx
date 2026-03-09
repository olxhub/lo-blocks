// src/components/blocks/layout/IntakeGate/_IntakeGate.tsx
//
// IntakeGate layout - gates content behind a readiness condition.
//
// Phase logic is driven by DSL expressions:
//   ready  → when truthy, show content (second child)
//   loading → when truthy and not ready, show loading spinner
//
// The `targets` attribute is syntactic sugar for LLM flows:
// it generates equivalent ready/loading expressions that watch
// TextSlot value/state fields.
//
'use client';

import React, { useMemo } from 'react';
import { useKids } from '@/lib/render';
import { useDSLExpression } from '@/lib/stateLanguage';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';

/**
 * Convert a `targets` attribute into equivalent DSL expressions.
 *
 * targets="ctx_1,ctx_2" generates:
 *   ready:   @ctx_1.value && @ctx_2.value
 *   loading: @ctx_1.state == 'LLM_RUNNING' || @ctx_2.state == 'LLM_RUNNING' || @ctx_1.value || @ctx_2.value
 */
function targetsToExpressions(targets: string): { ready: string; loading: string } {
  const ids = targets.split(',').map(s => s.trim()).filter(Boolean);
  const ready = ids.map(id => `@${id}.value`).join(' && ');
  const loading = [
    ...ids.map(id => `@${id}.state == 'LLM_RUNNING'`),
    ...ids.map(id => `@${id}.value`),
  ].join(' || ');
  return { ready, loading };
}

function _IntakeGate(props) {
  const { kids = [], targets, ready: readyProp, loading: loadingProp, id } = props;

  // Validate: exactly 2 children required
  if (kids.length !== 2) {
    return (
      <DisplayError
        id={id}
        name="IntakeGate"
        message={`IntakeGate requires exactly 2 children (intake and content), but got ${kids.length}`}
        technical={{ kids }}
      />
    );
  }

  // Validate: must have targets or ready
  if (!targets && !readyProp) {
    return (
      <DisplayError
        id={id}
        name="IntakeGate"
        message='IntakeGate requires either a "targets" or "ready" attribute'
        technical={{ example: '<IntakeGate ready="@output.value">' }}
      />
    );
  }

  // Resolve expressions: explicit props take precedence over targets-generated ones
  const { readyExpr, loadingExpr } = useMemo(() => {
    if (readyProp) {
      return { readyExpr: readyProp, loadingExpr: loadingProp };
    }
    const generated = targetsToExpressions(targets);
    return {
      readyExpr: generated.ready,
      loadingExpr: loadingProp ?? generated.loading,
    };
  }, [targets, readyProp, loadingProp]);

  // Evaluate phase expressions
  const isReady = useDSLExpression(props, readyExpr, false);
  const isLoading = useDSLExpression(props, loadingExpr, false);

  const phase = isReady ? 'content' : isLoading ? 'loading' : 'gate';

  // Children
  const gateKids = kids.slice(0, 1);
  const contentKids = kids.slice(1);

  // Always render both children to build the OLX DOM tree
  // Only include the appropriate one in React output based on phase
  // useKids must be called unconditionally
  const { kids: gateRendered } = useKids({ ...props, kids: gateKids });
  const { kids: contentRendered } = useKids({ ...props, kids: contentKids });

  if (phase === 'gate') {
    return (
      <div className="intake-gate intake-gate--intake">
        {gateRendered}
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="intake-gate intake-gate--loading">
        <Spinner>Personalizing content...</Spinner>
      </div>
    );
  }

  return (
    <div className="intake-gate intake-gate--content">
      {contentRendered}
    </div>
  );
}

export default _IntakeGate;
