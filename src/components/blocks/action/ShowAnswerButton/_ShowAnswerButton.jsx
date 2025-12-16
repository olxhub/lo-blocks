// src/components/blocks/action/ShowAnswerButton/_ShowAnswerButton.jsx
'use client';

import React, { useMemo, useCallback } from 'react';
import * as state from '@/lib/state';
import { getGrader } from '@/lib/blocks';
import { DisplayError } from '@/lib/util/debug';

/**
 * Button that toggles the showAnswer field on grader(s).
 * Supports explicit target attribute or parent grader inference.
 */
function _ShowAnswerButton(props) {
  const { label = 'Show Answer', target } = props;

  // Resolve target grader IDs - explicit target or parent inference
  const graderIds = useMemo(() => {
    if (target) {
      return target.split(',').map(id => id.trim()).filter(Boolean);
    }
    try {
      return [getGrader(props)];
    } catch (e) {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Read showAnswer from first grader (or use props.id as fallback for hook stability)
  const primaryGraderId = graderIds[0] ?? props.id;
  const showAnswerField = state.componentFieldByName(props, primaryGraderId, 'showAnswer');
  const [showAnswer] = state.useReduxState(props, showAnswerField, false, { id: primaryGraderId });

  const handleClick = useCallback(() => {
    const newValue = !showAnswer;
    // Toggle all targeted graders
    for (const graderId of graderIds) {
      const field = state.componentFieldByName(props, graderId, 'showAnswer');
      state.updateReduxField(props, field, newValue, { id: graderId });
    }
  }, [showAnswer, graderIds, props]);

  // No graders found - show error (after all hooks)
  if (graderIds.length === 0) {
    return (
      <DisplayError
        name="ShowAnswerButton"
        message="No grader found. Use target attribute or place inside a grader."
        data={{ id: props.id }}
      />
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`lo-show-answer-button ${showAnswer ? 'lo-answer-visible' : ''}`}
    >
      {showAnswer ? 'Hide Answer' : label}
    </button>
  );
}

export default _ShowAnswerButton;
