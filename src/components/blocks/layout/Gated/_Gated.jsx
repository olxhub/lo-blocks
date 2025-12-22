// src/components/blocks/layout/Gated/_Gated.jsx
//
// Gated layout - shows content only after prerequisite actions complete.
//
// Uses explicit targets attribute to know what to watch.
//
'use client';

import React from 'react';
import { renderCompiledKids } from '@/lib/render';
import * as state from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';

function _Gated(props) {
  const { kids = [], targets, id } = props;

  // Validate: exactly 2 children required
  if (kids.length !== 2) {
    return (
      <DisplayError
        id={id}
        name="Gated"
        message={`Gated requires exactly 2 children (gate and content), but got ${kids.length}`}
        technical={{ kids }}
      />
    );
  }

  // Validate: targets required
  if (!targets) {
    return (
      <DisplayError
        id={id}
        name="Gated"
        message="Gated requires a targets attribute listing PersonalizedText IDs to watch"
        technical={{ example: '<Gated targets="context_1,context_2">' }}
      />
    );
  }

  // Parse targets from comma-separated string
  const targetIds = targets.split(',').map(s => s.trim()).filter(Boolean);

  // Children
  const gateKids = kids.slice(0, 1);
  const contentKids = kids.slice(1);

  // Get field from first target to use for aggregation
  // (all targets should be same type with same fields)
  const sampleTargetId = targetIds[0];
  const valueField = state.componentFieldByName(props, sampleTargetId, 'value');
  const stateField = state.componentFieldByName(props, sampleTargetId, 'state');

  // Aggregate values from all targets
  const targetValues = state.useAggregate(props, valueField, targetIds, { fallback: '' });
  const targetStates = state.useAggregate(props, stateField, targetIds, { fallback: null });

  // Compute phase from aggregated values
  // TODO: This should check a general "Doneness" state, not LLM_STATUS specifically.
  // Gated should be able to gate on anything - problem correctness, form completion,
  // LLM responses, etc. LLM blocks should implement Doneness (they don't yet).
  // For now, we check LLM_STATUS.RUNNING as a proxy for "in progress".
  const allReady = targetValues.every(v => v != null && v !== '');
  const anyStarted = targetStates.some(s => s === LLM_STATUS.RUNNING) || targetValues.some(v => v);

  const phase = allReady ? 'content' : anyStarted ? 'loading' : 'gate';

  // Always render both children to build the OLX DOM tree
  // Only include the appropriate one in React output based on phase
  const gateRendered = renderCompiledKids({ ...props, kids: gateKids });
  const contentRendered = renderCompiledKids({ ...props, kids: contentKids });

  if (phase === 'gate') {
    return (
      <div className="gated gated-gate">
        {gateRendered}
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="gated gated-loading">
        <Spinner>Personalizing content...</Spinner>
      </div>
    );
  }

  return (
    <div className="gated gated-content">
      {contentRendered}
    </div>
  );
}

export default _Gated;
