// packages/shared/components/blocks/display/_StatusText.tsx
//
// Displays field values from related graders.
// Note: requiresGrader=true in block definition means graderId is injected by render.
//
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import * as state from '@/lib/state';
import { useFieldSelector, commonFields } from '@/lib/state';
import { useCorrectness } from '@/lib/grading';

// Grading-state fields route through useCorrectness — metagraders like
// CapaProblem don't store these; they are derived from child graders.
const GRADING_FIELDS = ['correct', 'message', 'score', 'submitCount'] as const;

function StatusText(props: RuntimeProps) {
  const { field = 'message', graderId } = props;
  // Constant per instance, so hook order is stable across renders.
  const isGradingField = (GRADING_FIELDS as readonly string[]).includes(field);

  // graderId is a StateKey injected by render (requiresGrader: true)
  const gradingState = useCorrectness(props, graderId);

  // Non-grading fields (e.g. field="value" with an explicit target) read the
  // target component's own field declaration. The placeholder field keeps
  // the hook unconditional when the grading path is active.
  const targetField = isGradingField
    ? commonFields.message
    : state.componentFieldByStateKey(props, graderId, field);
  const rawText = useFieldSelector(
    props,
    targetField,
    { selector: s => s?.[field] ?? '', fallback: '', stateKey: graderId }
  );

  const text = isGradingField ? (gradingState as any)[field] ?? '' : rawText;
  return <span>{text}</span>;
}

export default StatusText;
