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
  // TODO(fields): Extract a shared semantic field selector. fieldSelector
  // reads raw stored state and field.read decodes it; this higher layer should
  // also route block-specific derived fields (such as grading) for StatusText,
  // state-language refs, and other cross-component reads.
  const selectText = (s: any): string => {
    if (isGradingField) {
      return String(selectGradingState(s, props, graderId)[field as keyof GraderGradingState] ?? '');
    }

    const targetField = state.componentFieldByStateKey(props, graderId, field);
    return state.fieldSelector(s, props, targetField, {
      selector: (componentState: any) => componentState?.[field] ?? '',
      fallback: '',
      stateKey: graderId,
    });
  };
  const text = useSelector(selectText);
  return <span>{text}</span>;
}

export default StatusText;
