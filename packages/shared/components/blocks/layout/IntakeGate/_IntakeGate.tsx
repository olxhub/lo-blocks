// packages/shared/components/blocks/layout/IntakeGate/_IntakeGate.tsx
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
import type { RuntimeProps, StateRef } from '@/lib/types';

import React from 'react';
import { assertKidArray } from '@/lib/types/kids';
import { useKids } from '@/lib/player/client/render';
import { parse, useDSLExpression } from '@/lib/stateLanguage';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';

/**
 * Convert a `targets` attribute into equivalent DSL expressions.
 *
 * targets="ctx_1,ctx_2" generates:
 *   ready:   @ctx_1.value && @ctx_2.value
 *   loading: @ctx_1.state === 'LLM_RUNNING' || @ctx_2.state === 'LLM_RUNNING' || @ctx_1.value || @ctx_2.value
 *
 * Note: `ids` is already a string[] — the zod schema (z_stateRefList)
 * splits the comma-separated OLX attribute at parse time.
 */
function targetsToExpressions(ids: StateRef[]): { ready: string; loading: string } {
  // Quote IDs because they may contain namespace delimiters (/) or scope
  // markers (: #) that conflict with expression syntax.
  const ready = ids.map(id => `@"${id}".value`).join(' && ');
  const loading = [
    ...ids.map(id => `@"${id}".state === 'LLM_RUNNING'`),
    ...ids.map(id => `@"${id}".value`),
  ].join(' || ');
  return { ready, loading };
}

function IntakeGate(props: RuntimeProps) {
  const { kids = [], targets, ready: readyProp, loading: loadingProp, id } = props;
  assertKidArray(kids);

  // Validation conditions are captured (not returned) so the hooks below run
  // unconditionally; the DisplayError guards are emitted after all hooks.

  // targets is string[] (from z_stateRefList), so check length not truthiness
  const missingTarget = (!targets || (Array.isArray(targets) && targets.length === 0)) && !readyProp;

  // Resolve expressions: explicit props take precedence over targets-generated ones.
  // Only build from targets when present, so targetsToExpressions never runs on
  // undefined in the guard case.
  let readyExpr = '';
  let loadingExpr: string | undefined;
  if (readyProp) {
    readyExpr = readyProp;
    loadingExpr = loadingProp;
  } else if (targets && (!Array.isArray(targets) || targets.length > 0)) {
    const generated = targetsToExpressions(targets as StateRef[]);
    readyExpr = generated.ready;
    loadingExpr = loadingProp ?? generated.loading;
  }

  // Validate: authored expressions must be valid syntax
  let syntaxError: { name: string; expr: string; message: string } | null = null;
  for (const [name, expr] of [['ready', readyProp], ['loading', loadingProp]] as const) {
    if (expr) {
      try { parse(expr); } catch (e: any) {
        syntaxError = { name, expr, message: e.message };
        break;
      }
    }
  }

  // TODO: Validate that IDs referenced in ready/loading/targets expressions
  // actually exist as components. A typo like targets="outpt" (instead of
  // "output") silently resolves to undefined, leaving the gate permanently
  // locked with no visible error. See componentFieldByStateKey() for a pattern
  // that validates component existence and gives helpful error messages.

  // Evaluate phase expressions (useDSLExpression tolerates empty/undefined)
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

  // Validate: exactly 2 children required
  if (kids.length !== 2) {
    return (
      <DisplayError
        id={id}
        title="IntakeGate"
        message={`IntakeGate requires exactly 2 children (intake and content), but got ${kids.length}`}
        technical={{ kids }}
      />
    );
  }

  // Validate: must have targets or ready
  if (missingTarget) {
    return (
      <DisplayError
        id={id}
        title="IntakeGate"
        message='IntakeGate requires either a "targets" or "ready" attribute'
        technical={{ example: '<IntakeGate ready="@output.value">' }}
      />
    );
  }

  // Validate: targets must resolve to at least one ID
  if (!readyExpr) {
    return (
      <DisplayError
        id={id}
        title="IntakeGate"
        message='"targets" attribute is empty or contains only whitespace'
        technical={{ targets }}
      />
    );
  }

  if (syntaxError) {
    return (
      <DisplayError
        id={id}
        title="IntakeGate"
        message={`Invalid "${syntaxError.name}" expression: ${syntaxError.message}`}
        technical={{ expression: syntaxError.expr }}
      />
    );
  }

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

export default IntakeGate;
