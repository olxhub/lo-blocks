// src/components/blocks/_Correctness.jsx
'use client';
import React from 'react';
import { CORRECTNESS, getGrader } from '@/lib/blocks';
import { useFieldSelector } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';

function _Correctness(props) {
  const { id, fields } = props;

  let targetId;
  try {
    targetId = getGrader(props);
  } catch (e) {
    return (
      <DisplayError
        props={props}
        id={`${id}_grader_error`}
        name="Correctness"
        message={e.message}
      />
    );
  }

  const correctness = useFieldSelector(
    props,
    fields.correct,
    {
      selector: s => s?.correct ?? CORRECTNESS.UNSUBMITTED,
      fallback: CORRECTNESS.UNSUBMITTED,
      id: targetId
    }
  );

  const icons = {
    [CORRECTNESS.CORRECT]: '✅',
    [CORRECTNESS.PARTIALLY_CORRECT]: '🟡',
    [CORRECTNESS.INCORRECT]: '❌',
    [CORRECTNESS.INCOMPLETE]: '⚠️',
    [CORRECTNESS.INVALID]: '⚠️',
    [CORRECTNESS.SUBMITTED]: '⏳',
    [CORRECTNESS.UNSUBMITTED]: '❔'
  };

  return <span>{icons[correctness] || icons[CORRECTNESS.UNSUBMITTED]}</span>;
}

export default _Correctness;
