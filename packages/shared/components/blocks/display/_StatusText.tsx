// src/components/blocks/_StatusText.jsx
//
// Displays field values from related graders.
// Note: requiresGrader=true in block definition means graderId is injected by render.
//
'use client';
import React from 'react';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';

function _StatusText(props) {
  const { field = 'message', graderId } = props;

  // Get the field from the target component (not from our own fields)
  const targetField = state.componentFieldByName(props, graderId, field);

  const text = useFieldSelector(
    props,
    targetField,
    { selector: s => s?.[field] ?? '', fallback: '', id: graderId }
  );
  return <span>{text}</span>;
}

export default _StatusText;
