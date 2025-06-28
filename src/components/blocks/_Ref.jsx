'use client';

// src/components/blocks/_Ref.jsx
import React from 'react';
import { useFieldSelector, fieldByName } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';

export default function _Ref(props) {
  const { target = '', visible = true, fallback = '' } = props;
  const [id, field = 'value'] = target.split('.');
  const info = fieldByName(field);

  if (!info) {
    return <DisplayError name="Ref" message={`Unknown field \"${field}\"`} data={{target}} />;
  }

  const value = useFieldSelector(props, info, { id, fallback: fallback });

  if (String(visible) === 'false') {
    // Still subscribe to value but render nothing
    return null;
  }

  return <span>{value}</span>;
}
