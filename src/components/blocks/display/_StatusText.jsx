// src/components/blocks/_StatusText.jsx
'use client';
import React from 'react';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { getGrader } from '@/lib/blocks';
import { DisplayError } from '@/lib/util/debug';

function _StatusText(props) {
  const { id, field = 'message' } = props;

  let targetId;
  try {
    targetId = getGrader(props);
  } catch (e) {
    return (
      <DisplayError
        props={props}
        id={`${id}_grader_error`}
        name="StatusText"
        message={e.message}
      />
    );
  }

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
