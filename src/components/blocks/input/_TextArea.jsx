// src/components/blocks/_TextArea.jsx
'use client';

import React from 'react';
import { useReduxInput } from '@/lib/state';
import { useGraderAnswer } from '@/lib/blocks';
import { renderCompiledKids } from '@/lib/render';

function _TextArea( props ) {
  // Note: updateValidator is a function, and so can't come from OLX or JSON.
  const { className, fields, updateValidator } = props;
  const [value, inputProps] = useReduxInput(
    props, fields.value, '',
    { updateValidator }
  );

  // Check if grader is showing the answer
  const { showAnswer, displayAnswer } = useGraderAnswer(props);

  return (
    <>
      {renderCompiledKids( props )}
      <textarea
        {...inputProps}
        className={className ?? 'large-input'}
      />
      {showAnswer && displayAnswer != null && (
        <div className="lo-show-answer-label">
          Correct: {displayAnswer}
        </div>
      )}
    </>
  );
}

export default _TextArea;
