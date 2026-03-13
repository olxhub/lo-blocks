// src/components/blocks/_StatusText.jsx
//
// Displays field values from related graders.
// Note: requiresGrader=true in block definition means graderId is injected by render.
//
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { refToReduxKey } from '@/lib/blocks/idResolver';

function _StatusText(props: RuntimeProps) {
  const { field = 'message', graderId } = props;

  // Get the field from the target component (not from our own fields)
  const targetField = state.componentFieldByName(props, graderId, field);

  const text = useFieldSelector(
    props,
    targetField,
    { selector: s => s?.[field] ?? '', fallback: '', reduxKey: refToReduxKey({ ...props, id: graderId }) }
  );
  return <span>{text}</span>;
}

export default _StatusText;
