// packages/shared/components/blocks/display/_StatusText.tsx
//
// Displays field values from related graders.
// Note: requiresGrader=true in block definition means graderId is injected by render.
//
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { useSelector } from 'react-redux';
import * as state from '@/lib/state';
import { selectGradingState, type GraderGradingState } from '@/lib/grading';

// Grading-state fields route through selectGradingState — metagraders like
// CapaProblem don't store these; they are derived from child graders.
const GRADING_FIELDS: (keyof GraderGradingState)[] = ['correct', 'message', 'score', 'submitCount'];

function StatusText(props: RuntimeProps) {
  const { field = 'message', graderId } = props;
  // Constant per instance, so the selector shape is stable across renders.
  const isGradingField = (GRADING_FIELDS as string[]).includes(field);

  // graderId is a StateKey injected by render (requiresGrader: true).
  // Non-grading fields (e.g. field="value" with an explicit target) read the
  // target component's own field declaration.
  const targetField = isGradingField
    ? null
    : state.componentFieldByStateKey(props, graderId, field);
  const text = useSelector((s: any) => isGradingField
    ? String(selectGradingState(s, props, graderId)[field as keyof GraderGradingState] ?? '')
    : state.fieldSelector(s, props, targetField!, { selector: (cs: any) => cs?.[field] ?? '', fallback: '', stateKey: graderId }));
  return <span>{text}</span>;
}

export default StatusText;
