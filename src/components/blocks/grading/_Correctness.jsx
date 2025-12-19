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

  // Flash animation when correctness changes (including same value re-submission)
  // We detect this by watching submitCount which increments on each submit
  const submitCount = useFieldSelector(
    props,
    fields.submitCount,
    {
      selector: s => s?.submitCount ?? 0,
      fallback: 0,
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

  // Alternate between two identical animation classes to force re-trigger
  // This defeats browser/React optimization that skips "unchanged" animations
  const flashClass = submitCount > 0
    ? (submitCount % 2 === 0 ? 'lo-correctness-flash-a' : 'lo-correctness-flash-b')
    : '';

  return (
    <>
      <style>{`
        @keyframes lo-correctness-pulse-a {
          0% { transform: scale(1.3); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes lo-correctness-pulse-b {
          0% { transform: scale(1.3); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        .lo-correctness-flash-a {
          animation: lo-correctness-pulse-a 0.2s ease-out;
        }
        .lo-correctness-flash-b {
          animation: lo-correctness-pulse-b 0.2s ease-out;
        }
      `}</style>
      <span className={flashClass} style={{ display: 'inline-block' }}>
        {icons[correctness] || icons[CORRECTNESS.UNSUBMITTED]}
      </span>
    </>
  );
}

export default _Correctness;
