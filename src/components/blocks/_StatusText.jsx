// src/components/blocks/_StatusText.jsx
'use client';
import React from 'react';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';

function _StatusText(props) {
  const { targets, infer, field = 'message' } = props;
  const ids = inferRelatedNodes(props, {
    selector: n => n.node.blueprint?.isGrader,
    infer,
    targets
  });
  const targetId = ids[0];

  // Get the field from the target component (not from our own fields)
  const targetField = state.componentFieldByName(props, targetId, field);

  const text = useFieldSelector(
    props,
    targetField,
    { selector: s => s?.[field] ?? '', fallback: '', id: targetId }
  );
  return <span>{text}</span>;
}

export default _StatusText;
