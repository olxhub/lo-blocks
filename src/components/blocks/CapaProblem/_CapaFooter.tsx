// src/components/blocks/CapaProblem/_CapaFooter.tsx
//
// Footer component for CapaProblem containing action buttons and status display.
// Renders: Check/Submit button, Show Answer button, Hint button, correctness icon, status text.
//
// Uses problemModes utilities for:
// - Button labels (Check vs Submit based on attempts)
// - Show Answer visibility (based on showanswer mode)
// - Disabling submit when attempts exhausted
//
'use client';
import React from 'react';
import { renderBlock } from '@/lib/render';
import {
  getButtonLabel,
  shouldShowAnswer,
  isSubmitDisabled,
  getAttemptsDisplay,
  parseMaxAttempts,
  type ProblemState,
} from '@/lib/blocks/problemModes';

/**
 * Build ProblemState from component props.
 */
function buildProblemState(props): ProblemState {
  return {
    submitCount: props.submitCount ?? 0,
    maxAttempts: parseMaxAttempts(props.maxAttempts),
    correct: props.correct ?? null,
  };
}

export default function _CapaFooter(props) {
  const { id, target, hintsTarget, label, showanswer } = props;

  // Build state for problemModes utilities
  const problemState = buildProblemState(props);

  // Compute button label and disabled state
  const buttonLabel = label || getButtonLabel(problemState);
  const submitDisabled = isSubmitDisabled(problemState);
  const attemptsDisplay = getAttemptsDisplay(problemState);

  // Compute Show Answer visibility
  const showAnswerVisible = shouldShowAnswer(showanswer, problemState);

  // Element IDs
  const buttonId = `${id}_action`;
  const showAnswerId = `${id}_show_answer`;
  const hintButtonId = `${id}_hint`;
  const statusIconId = `${id}_status_icon`;
  const statusTextId = `${id}_status_text`;

  // ActionButton needs target to trigger child grader actions
  // ShowAnswerButton targets same graders to toggle showAnswer state
  // HintButton targets DemandHints to reveal hints sequentially
  // Correctness/StatusText use requiresGrader: true - render injects graderId from CapaProblem
  return (
    <div className="lo-capafooter">
      <div className="lo-capafooter__actions">
        {renderBlock(props, 'ActionButton', {
          id: buttonId,
          label: buttonLabel,
          target,
          disabled: submitDisabled ? 'true' : undefined,
        })}
        {hintsTarget && renderBlock(props, 'HintButton', { id: hintButtonId, target: hintsTarget })}
        {showAnswerVisible && renderBlock(props, 'ShowAnswerButton', { id: showAnswerId, target })}
      </div>
      <div className="lo-capafooter__status">
        {renderBlock(props, 'Correctness', { id: statusIconId })}
        {renderBlock(props, 'StatusText', { id: statusTextId, field: 'message' })}
        {attemptsDisplay && (
          <span className="lo-capafooter__attempts">{attemptsDisplay}</span>
        )}
      </div>
    </div>
  );
}
