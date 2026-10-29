// packages/shared/components/blocks/CapaProblem/_CapaFooter.tsx
//
// Footer component for CapaProblem containing action buttons and status display.
// Renders: Check/Submit button, Don't know button, Show Answer button, Hint button,
// correctness icon, status text.
//
// Uses problemModes utilities for:
// - Button labels (Check vs Submit based on attempts)
// - Show Answer visibility (based on showanswer mode)
// - Disabling submit when attempts exhausted
//
'use client';
import type { RuntimeProps } from '@/lib/types';
import React, { useEffect, useRef } from 'react';
import { Block } from '@/lib/player/client/render';
import * as state from '@/lib/state';
import { correctness } from '@/lib/blocks';
import { normalizeTargetIds } from '@/lib/blocks/dynamicDom';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';
import {
  getButtonLabel,
  shouldShowAnswer,
  isSubmitDisabled,
  getAttemptsDisplay,
  isAttemptsClosed,
  parseMaxAttempts,
  type ProblemState,
} from '@/lib/grading/problemModes';

/**
 * "Don't know" stays available while the learner could still answer: not
 * after a correct answer, a give-up, or a pending grade, and not once
 * attempts are exhausted. After a wrong answer with attempts left it is the
 * way to stop: the problem is then done without a correct answer.
 */
function dontKnowAvailable(props): boolean {
  if (!props.dontKnow) return false;
  const value = props.correct ?? correctness.unsubmitted;
  if (value === correctness.correct || value === correctness.gaveUp || value === correctness.submitted) return false;
  return !isAttemptsClosed(buildProblemState(props));
}

/**
 * Record the give-up on the problem. Whether that reveals the answer is the
 * showanswer mode's policy: every mode but 'never' reveals.
 */
function giveUp(props) {
  if (!props.problem) throw new Error('CapaFooter: dontKnow requires the enclosing problem\'s state key');
  const problemKey = props.problem;
  state.updateField(props, state.componentFieldByStateKey(props, problemKey, 'gaveUp'), true, { stateKey: problemKey });
  if (props.showanswer === 'never') return;
  for (const graderKey of normalizeTargetIds(props.target, props.runtime.ns) || []) {
    state.updateField(props, state.componentFieldByStateKey(props, graderKey, 'showAnswer'), true, { stateKey: graderKey });
  }
}

/**
 * Build ProblemState from component props.
 */
function buildProblemState(props): ProblemState {
  return {
    submitCount: props.submitCount ?? 0,
    maxAttempts: parseMaxAttempts(props.maxAttempts),
    correct: props.correct ?? correctness.unsubmitted,
  };
}

export default function CapaFooter(props: RuntimeProps) {
  const { id, target, hintsTarget, label, showanswer } = props;
  const { t } = useBlockTranslation(props);

  // Immediate mode: correctness derives from live input values, so there is
  // nothing to submit — no Check button, and no attempt bookkeeping.
  const isImmediate = props.grade === 'immediate';

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

  // The Don't know button unmounts on click; focus the answer toggle or the problem.
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const gaveUpRef = useRef(false);
  useEffect(() => {
    if (!gaveUpRef.current || props.correct !== correctness.gaveUp) return;
    gaveUpRef.current = false;
    const actions = actionsRef.current;
    (actions?.querySelector<HTMLElement>('.lo-show-answer-button') ?? actions?.closest<HTMLElement>('.lo-problem'))?.focus();
  }, [props.correct]);

  // ActionButton needs target to trigger child grader actions
  // ShowAnswerButton targets same graders to toggle showAnswer state
  // HintButton targets DemandHints to reveal hints sequentially
  // Correctness/StatusText use requiresGrader: true - render injects graderId from CapaProblem
  return (
    <div className="lo-capafooter">
      <div className="lo-capafooter__actions" ref={actionsRef}>
        {!isImmediate && <Block props={props} tag="ActionButton"
          id={buttonId}
          label={buttonLabel}
          target={target}
          disabled={submitDisabled ? 'true' : undefined}
        />}
        {dontKnowAvailable(props) && (
          <button type="button" id={`${id}_dont_know`} className="lo-capafooter__dont-know"
            onClick={() => { gaveUpRef.current = true; giveUp(props); }} aria-label={t('dontKnowLabel')}>
            {t('dontKnow')}
          </button>
        )}
        {hintsTarget && <Block props={props} tag="HintButton" id={hintButtonId} target={hintsTarget} />}
        {showAnswerVisible && <Block props={props} tag="ShowAnswerButton" id={showAnswerId} target={target} />}
      </div>
      <div className="lo-capafooter__status">
        <Block props={props} tag="Correctness" id={statusIconId} />
        <Block props={props} tag="StatusText" id={statusTextId} field="message" />
        {!isImmediate && attemptsDisplay && (
          <span className="lo-capafooter__attempts">{attemptsDisplay}</span>
        )}
      </div>
    </div>
  );
}
