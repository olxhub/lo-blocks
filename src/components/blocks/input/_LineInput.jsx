// src/components/blocks/_LineInput.jsx
'use client';

import React from 'react';
import { useReduxInput } from '@/lib/state';
import { useGraderAnswer } from '@/lib/blocks';
import { renderCompiledKids } from '@/lib/render';

const allowedAttrs = ['min', 'max', 'placeholder', 'type', 'step'];

export default function _LineInput( props ) {
  const { fields, updateValidator, ...rest } = props;

  const [value, inputProps] = useReduxInput(
    props, fields.value, '',
    { updateValidator }
  );

  // Check if grader is showing the answer
  const { showAnswer, displayAnswer } = useGraderAnswer(props);

  const passthrough = Object.fromEntries(
    allowedAttrs
      .filter(key => rest[key] !== undefined)
      .map(key => [key, rest[key]])
  );

  return (
    <>
      {renderCompiledKids( props )}
      <input
        {...inputProps}
        {...passthrough}
        className="border rounded px-2"
      />
      {showAnswer && displayAnswer != null && (
        <span className="lo-show-answer-label">
          Correct: {displayAnswer}
        </span>
      )}
    </>
  );
}
