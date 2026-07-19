// packages/shared/components/blocks/display/_StatusText.tsx
//
// Displays field values from related graders.
// Note: requiresGrader=true in block definition means graderId is injected by render.
//
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';

function StatusText(props: RuntimeProps) {
  const { field = 'message', graderId } = props;

  // One generic read: componentFieldByStateKey resolves stored AND
  // computed (blueprint-selector) fields — grading state, values, all the
  // same path. No grading knowledge here.
  const targetField = state.componentFieldByStateKey(props, graderId, field);
  const text = useFieldSelector(props, targetField, { fallback: '', stateKey: graderId });
  return <span>{String(text ?? '')}</span>;
}

export default StatusText;
