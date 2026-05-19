// src/components/blocks/action/ShowAnswerButton/_ShowAnswerButton.jsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useMemo, useCallback } from 'react';
import * as state from '@/lib/state';
import { getGrader } from '@/lib/blocks';
import { scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import { DisplayError } from '@/lib/util/debug';

/**
 * Button that toggles the showAnswer field on grader(s).
 * Supports explicit target attribute or parent grader inference.
 */
function _ShowAnswerButton(props: RuntimeProps) {
  const { label = 'Show Answer', target } = props;

  // Resolve target grader StateKeys - explicit target or parent inference
  const graderReduxKeys = useMemo(() => {
    if (target) {
      // target is z_stateRefList — resolve authored refs in this runtime context.
      const targetRefs = Array.isArray(target) ? target : [target];
      return targetRefs.map(ref => scopedStateKeyForBlock({ ...props, id: ref }));
    }
    try {
      // getGrader returns DefinitionKey — convert to StateKey
      return [scopedStateKeyForBlock({ ...props, id: getGrader(props) })];
    } catch (e) {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Read showAnswer from first grader (or use own key as fallback for hook stability)
  const primaryGraderKey = graderReduxKeys[0] ?? scopedStateKeyForBlock(props);
  const showAnswerField = state.componentFieldByName(props, primaryGraderKey, 'showAnswer');
  const [showAnswer] = state.useFieldState(props, showAnswerField, false, { stateKey: primaryGraderKey });

  const handleClick = useCallback(() => {
    const newValue = !showAnswer;
    // Toggle all targeted graders
    for (const graderKey of graderReduxKeys) {
      const field = state.componentFieldByName(props, graderKey, 'showAnswer');
      state.updateField(props, field, newValue, { stateKey: graderKey });
    }
  }, [showAnswer, graderReduxKeys, props]);

  // No graders found - show error (after all hooks)
  if (graderReduxKeys.length === 0) {
    return (
      <DisplayError
        title="ShowAnswerButton"
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
