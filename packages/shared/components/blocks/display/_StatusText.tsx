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

  // Get the field from the target component (not from our own fields)
  // graderId is a StateKey injected by render (requiresGrader: true)
  const targetField = state.componentFieldByStateKey(props, graderId, field);

  const text = useFieldSelector(
    props,
    targetField,
    { selector: s => s?.[field] ?? '', fallback: '', stateKey: graderId }
  );
  return <span>{text}</span>;
}

export default StatusText;
