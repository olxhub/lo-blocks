// src/components/blocks/_Correctness.jsx
//
// Visual indicator showing grading status.
// Note: requiresGrader=true in block definition means graderId is injected by render.
//
'use client';
import React from 'react';
import { CORRECTNESS } from '@/lib/blocks';
import { useFieldSelector } from '@/lib/state';

function _Correctness(props) {
  const { fields, graderId } = props;

  const correctness = useFieldSelector(
    props,
    fields.correct,
    {
      selector: s => s?.correct ?? CORRECTNESS.UNSUBMITTED,
      fallback: CORRECTNESS.UNSUBMITTED,
      id: graderId
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
