// packages/shared/components/blocks/CapaProblem/_CapaFooter.tsx
//
// Footer component for CapaProblem containing action buttons and status display.
// Renders: Check/Submit button, Show Answer button, Hint button, correctness icon, status text.
//
// Uses problemModes utilities for:
// - Button label and attempts text (one decision table: getAttemptsPresentation)
// - Show Answer visibility (based on showanswer mode)
// - Disabling submit when attempts exhausted
//
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { Block } from '@/lib/player/client/render';
import {
  getAttemptsPresentation,
  shouldShowAnswer,
  isSubmitDisabled,
  parseMaxAttempts,
  type ProblemState,
} from '@/lib/grading/problemModes';

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

export default function _CapaFooter(props: RuntimeProps) {
  const { id, target, hintsTarget, label, showanswer } = props;

  // Immediate mode: correctness derives from live input values, so there is
  // nothing to submit — no Check button, and no attempt bookkeeping.
  const isImmediate = props.grade === 'immediate';

  // Build state for problemModes utilities
  const problemState = buildProblemState(props);

  // Button label and attempts text come from one decision table (see
  // getAttemptsPresentation); an authored `label` overrides only the button.
  const { label: computedLabel, attemptsText } = getAttemptsPresentation(problemState);
  const buttonLabel = label || computedLabel;
  const submitDisabled = isSubmitDisabled(problemState);

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
        {!isImmediate && <Block props={props} tag="ActionButton"
          id={buttonId}
          label={buttonLabel}
          target={target}
          disabled={submitDisabled ? 'true' : undefined}
        />}
        {hintsTarget && <Block props={props} tag="HintButton" id={hintButtonId} target={hintsTarget} />}
        {showAnswerVisible && <Block props={props} tag="ShowAnswerButton" id={showAnswerId} target={target} />}
      </div>
      <div className="lo-capafooter__status">
        <Block props={props} tag="Correctness" id={statusIconId} />
        <Block props={props} tag="StatusText" id={statusTextId} field="message" />
        {!isImmediate && attemptsText && (
          <span className="lo-capafooter__attempts">{attemptsText}</span>
        )}
      </div>
    </div>
  );
}
