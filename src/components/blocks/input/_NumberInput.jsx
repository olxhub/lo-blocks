// src/components/blocks/_NumberInput.jsx
'use client';
import React from 'react';
import { useReduxInput } from '@/lib/state';
import { useGraderAnswer } from '@/lib/blocks';

function _NumberInput(props) {
  const { className, fields, children, min, max, step, placeholder } = props;
  const [value, inputProps] = useReduxInput(props, fields.value, '');

  // Check if grader is showing the answer
  const { showAnswer, displayAnswer } = useGraderAnswer(props);

  return (
    <>
      {children}
      <input
        type="number"
        {...inputProps}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className={className ?? 'border rounded px-2'}
      />
      {showAnswer && displayAnswer != null && (
        <span className="lo-show-answer-label">
          Correct: {displayAnswer}
        </span>
      )}
    </>
  );
}

export default _NumberInput;
