'use client';

// src/components/blocks/_Ref.jsx
import React from 'react';
import { useValue, useFieldSelector, fieldByName } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';

export default function _Ref(props) {
  const { target, visible = true, fallback = '', field, kids = '' } = props;

  // Target can come from attribute or children text (like Element)
  const targetId = target || (typeof kids === 'string' ? kids : String(kids)).trim();

  if (!targetId) {
    return <DisplayError name="Ref" message="No target specified. Use target attribute or provide component ID as content." data={{props}} />;
  }

  // Check if target block exists
  if (!props.idMap || !props.idMap[targetId]) {
    return <DisplayError name="Ref" message={`Target block "${targetId}" not found`} data={{targetId, availableIds: Object.keys(props.idMap || {})}} />;
  }

  // Use useValue (calls getValue) unless specific field is requested
  let value;
  if (field) {
    // Explicit field access (for future dot syntax support)
    const fieldInfo = fieldByName(field);
    if (!fieldInfo) {
      return <DisplayError name="Ref" message={`Unknown field "${field}"`} data={{target: targetId, field}} />;
    }
    value = useFieldSelector(props, fieldInfo, { id: targetId, fallback });
  } else {
    // Use getValue() method (default behavior)
    value = useValue(props, targetId, { fallback });
  }

  if (String(visible) === 'false') {
    // Still subscribe to value but render nothing
    return <></>;
  }

  return <span>{value}</span>;
}