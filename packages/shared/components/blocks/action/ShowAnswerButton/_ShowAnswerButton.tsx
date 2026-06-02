// src/components/blocks/action/ShowAnswerButton/_ShowAnswerButton.jsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useMemo, useCallback } from 'react';
import * as state from '@/lib/state';
import { showAnswer as showAnswerField } from '@/lib/state/commonFields';
import { getGrader } from '@/lib/blocks';
import { scopedStateKeyForBlock, stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import { DisplayError } from '@/lib/util/debug';

/**
 * Button that toggles the showAnswer field on grader(s).
 * Supports explicit target attribute or parent grader inference.
 */
function _ShowAnswerButton(props: RuntimeProps) {
  const { label = 'Show Answer', target } = props;

  // Resolve target grader StateKeys - explicit target or parent inference
  const graderStateKeys = useMemo(() => {
    if (target) {
      // target is z_stateRefList — resolve authored refs globally (no idPrefix).
      const targetRefs = Array.isArray(target) ? target : [target];
      return targetRefs.map(ref => stateKeyForGlobalRef(ref, props.runtime.ns));
    }
    try {
      // getGrader now returns StateKey directly
      return [getGrader(props)];
    } catch (e) {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Read showAnswer from first grader. When no grader found, use own key and
  // the global showAnswer field for hook stability — the value is unused since
  // we render DisplayError below.
  const hasGraders = graderStateKeys.length > 0;
  const primaryGraderKey = graderStateKeys[0] ?? scopedStateKeyForBlock(props);
  const resolvedField = hasGraders
    ? state.componentFieldByStateKey(props, primaryGraderKey, 'showAnswer')
    : showAnswerField;
  const [showAnswer] = state.useFieldState(props, resolvedField, false, { stateKey: primaryGraderKey });

  const handleClick = useCallback(() => {
    const newValue = !showAnswer;
    // Toggle all targeted graders
    for (const graderKey of graderStateKeys) {
      const field = state.componentFieldByStateKey(props, graderKey, 'showAnswer');
      state.updateField(props, field, newValue, { stateKey: graderKey });
    }
  }, [showAnswer, graderStateKeys, props]);

  // No graders found - show error (after all hooks)
  if (graderStateKeys.length === 0) {
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
