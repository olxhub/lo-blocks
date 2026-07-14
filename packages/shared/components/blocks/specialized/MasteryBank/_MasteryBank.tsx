// packages/shared/components/blocks/specialized/MasteryBank/_MasteryBank.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect, useRef } from 'react';
import { useRenderedBlock } from '@/lib/render';
import { useFieldState, useFieldSelector, commonFields } from '@/lib/state';
import { extendIdPrefix, scopeMarker, parseDefinitionRef, scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import { correctness } from '@/lib/blocks';
import { DisplayError } from '@/lib/util/debug';
import { fisherYatesShuffleInPlace } from '@/lib/util/shuffle';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';

/**
 * Returns array of indices [0, length) in random order.
 */
function shuffledIndices(length: number): number[] {
  const result = Array.from({ length }, (_, i) => i);
  fisherYatesShuffleInPlace(result);
  return result;
}

/**
 * Order modes for problem selection.
 *
 * TODO: Replace ad-hoc navigation with useKidCursor hook (see Sequential's spec).
 * MasteryBank adds shuffle mode, attempt scoping, and cycle detection on top of
 * basic cursor navigation. A shared hook would benefit both Sequential and MasteryBank.
 *
 * Each mode provides:
 *   - initial(itemCount): Returns initial state
 *   - nextItem(itemCount, state): Returns { nextItem, newState, completedFullCycle }
 *   - currentItem(state): Returns current item index from state
 *   - position(state): Returns 0-indexed position for display
 *
 * The `completedFullCycle` flag indicates when we've gone through all problems
 * and are starting over. This triggers an increment of `attemptNumber`, which
 * scopes child state so previously-answered problems appear fresh (their old
 * answers are stored under a different Redux key).
 */
const ORDER_MODES = {
  // Linear: 0,1,2,0,1,2,0,1,2...
  linear: {
    initial: () => 0,
    nextItem: (itemCount, state) => {
      const next = (state + 1) % itemCount;
      const completedFullCycle = next === 0;
      return { nextItem: next, newState: next, completedFullCycle };
    },
    currentItem: (state) => state,
    position: (state) => state
  },
  // Shuffle: randomize order, reshuffle when we loop back
  shuffle: {
    initial: (itemCount) => ({ order: shuffledIndices(itemCount), index: 0 }),
    nextItem: (itemCount, state) => {
      const nextIndex = state.index + 1;
      if (nextIndex >= itemCount) {
        const newOrder = shuffledIndices(itemCount);
        return { nextItem: newOrder[0], newState: { order: newOrder, index: 0 }, completedFullCycle: true };
      }
      return { nextItem: state.order[nextIndex], newState: { ...state, index: nextIndex }, completedFullCycle: false };
    },
    currentItem: (state) => state.order[state.index],
    position: (state) => state.index
  }
};

/**
 * Checks if correctness represents a "real" graded answer (not pending/invalid states).
 */
function isGradedAnswer(value) {
  return value === correctness.correct ||
         value === correctness.incorrect ||
         value === correctness.partiallyCorrect;
}

/**
 * Inner component that watches grader state and handles advancement.
 * Separated to allow unconditional hook calls (useFieldSelector requires valid field).
 */
function MasteryProblem({ props, problemId, attemptNumber, masteryState, handlers }) {
  const { id } = props;
  const { problemIds, correctStreak, goalNum, firstSubmissionResult, modeState, orderMode } = masteryState;
  const { setCorrectStreak, setModeState, setCompleted, setCorrect, setFirstSubmissionResult, setAttemptNumber } = handlers;

  const { idPrefix: scopedIdPrefix } = extendIdPrefix(props, [id, scopeMarker('attempt_' + attemptNumber)]);

  // FIXME: Should not spread runtime like this - need proper scoped runtime factory
  // Components should treat runtime as black box. Only idPrefix changes at boundaries.
  const scopedRuntime = { ...props.runtime, idPrefix: scopedIdPrefix };

  const scopedProps = {
    ...props,
    runtime: scopedRuntime,
  };
  // CapaProblem is a metagrader (isGrader: true) that aggregates its child graders.
  // Watch its own correctness rather than guessing the inner grader's auto-generated ID.
  const scopedGraderRef = parseDefinitionRef(problemId, 'MasteryBank problem');
  const scopedProblemKey = scopedStateKeyForBlock({ id: scopedGraderRef, ns: props.runtime.ns, idPrefix: scopedIdPrefix });

  // Render problem — by its SCOPED instance key: the attempt scope is the
  // instance identity, and the state gate must resolve the attempt's own
  // state, not the unscoped problem's (which gated the wrong bucket and
  // let a fresh attempt write-from-empty — found by review 2026-07).
  const { block: renderedProblem, error } = useRenderedBlock(scopedProps, scopedProblemKey);

  // TODO: Replace this 7-line pattern with a useCorrectness(props, graderRef) one-liner.
  // The hook would encapsulate commonFields.correct, scopedStateKeyForBlock, and useFieldSelector.
  // Needs design work: scoped idPrefix, grader naming convention, and field selector
  // options all need to compose correctly. Would benefit all grader-aware components.
  const graderField = commonFields.correct;
  const scopedGraderStateKey = scopedProblemKey;
  const currentCorrectness = useFieldSelector(
    scopedProps,
    graderField,
    { stateKey: scopedGraderStateKey, fallback: correctness.unsubmitted, selector: s => s?.correct }
  );

  const prevCorrectnessRef = useRef(currentCorrectness);

  // Handle correctness changes
  useEffect(() => {
    const prevCorrectness = prevCorrectnessRef.current;
    prevCorrectnessRef.current = currentCorrectness;

    // Only act on actual changes to graded answers
    if (prevCorrectness === currentCorrectness || !isGradedAnswer(currentCorrectness)) {
      return;
    }

    const advanceToNext = () => {
      setFirstSubmissionResult(null);
      const { newState, completedFullCycle } = orderMode.nextItem(problemIds.length, modeState);
      setModeState(newState);
      if (completedFullCycle) {
        setAttemptNumber(attemptNumber + 1);
      }
    };

    if (currentCorrectness === correctness.correct) {
      if (firstSubmissionResult === null) {
        // First try correct - increment streak and advance
        const newStreak = correctStreak + 1;
        setCorrectStreak(newStreak);
        setFirstSubmissionResult(correctness.correct);
        if (newStreak >= goalNum) {
          setCompleted(true);
          setCorrect(correctness.correct);
        } else {
          setCorrect(correctness.incomplete);
          advanceToNext();
        }
      } else if (firstSubmissionResult === correctness.incorrect) {
        // Correct after incorrect - advance without incrementing streak
        advanceToNext();
      }
    } else {
      // INCORRECT or PARTIALLY_CORRECT
      if (firstSubmissionResult === null) {
        // First try wrong - reset streak, stay on problem
        setFirstSubmissionResult(correctness.incorrect);
        setCorrectStreak(0);
        setCorrect(correctness.incomplete);
      }
    }
  }, [currentCorrectness, firstSubmissionResult, correctStreak, goalNum, problemIds.length, modeState, orderMode, attemptNumber, setCorrectStreak, setModeState, setCompleted, setCorrect, setFirstSubmissionResult, setAttemptNumber]);

  // Show helpful error for content authors if problem not found
  if (error) {
    return (
      <DisplayError
        props={props}
        title="MasteryBank"
        message={`Problem not found: "${problemId}"`}
        technical={{
          hint: 'Make sure this problem is defined elsewhere in your content.',
          problemId,
          blockId: props.id,
          error
        }}
        id={`${props.id}_problem_not_found`}
      />
    );
  }

  // useRenderedBlock returns Spinner when loading - just render the block
  return (
    <div className="lo-mastery-bank__problem">
      {renderedProblem}
    </div>
  );
}

export default function MasteryBank(props: RuntimeProps) {
  const { id, fields, kids, goal, mode } = props;

  const { t } = useBlockTranslation(props);
  const orderMode = ORDER_MODES[mode] || ORDER_MODES.linear;

  // kids.problemIds is guaranteed by the parser (see MasteryBank.ts postprocess)
  const problemIds: string[] = (kids as any).problemIds;
  // goal is a positive integer, guaranteed by z.coerce.number().int().positive() in schema
  const goalNum = goal;
  const [correctStreak, setCorrectStreak] = useFieldState(props, fields.correctStreak, 0);
  const [completed, setCompleted] = useFieldState(props, fields.completed, false);
  const [, setCorrect] = useFieldState(props, fields.correct, null);
  let [modeState, setModeState] = useFieldState(props, fields.modeState, null);
  const [firstSubmissionResult, setFirstSubmissionResult] = useFieldState(props, fields.firstSubmissionResult, null);
  const [attemptNumber, setAttemptNumber] = useFieldState(props, fields.attemptNumber, 0);

  if (modeState === null) {
    modeState = problemIds.length > 0 ? orderMode.initial(problemIds.length) : 0;
    setModeState(modeState);
  }

  // Empty content — content author error, not a parser bug
  if (problemIds.length === 0) {
    return (
      <DisplayError
        props={props}
        title="MasteryBank"
        message="No problems found in MasteryBank"
        technical={{
          hint: 'Add problem IDs as content, e.g., <MasteryBank>problem_id_1, problem_id_2</MasteryBank>',
          blockId: id
        }}
        id={`${id}_no_problems`}
      />
    );
  }

  const currentProblemIndex = orderMode.currentItem(modeState);
  const currentProblemId = problemIds[currentProblemIndex];

  // Error: invalid state
  if (!currentProblemId) {
    return (
      <DisplayError
        props={props}
        title="MasteryBank"
        message="Unable to select current problem"
        technical={{
          hint: 'Internal state error - modeState may not be initialized',
          currentProblemIndex,
          modeState,
          blockId: id
        }}
        id={`${id}_no_current_problem`}
      />
    );
  }

  // Completion state
  if (completed) {
    return (
      <div className="lo-mastery-bank lo-mastery-bank--complete">
        <div className="lo-mastery-bank__success">
          <h3>{t('masteryAchieved')}</h3>
          <p>{t('masteryDescription', { goal: goalNum })}</p>
        </div>
      </div>
    );
  }

  const displayPosition = orderMode.position(modeState) + 1;

  return (
    <div className="lo-mastery-bank">
      <div className="lo-mastery-bank__header">
        <div className="lo-mastery-bank__progress">
          {t('streak', { current: correctStreak, goal: goalNum })}
        </div>
        <div className="lo-mastery-bank__count">
          {t('progress', { current: displayPosition, total: problemIds.length })}
        </div>
      </div>

      <MasteryProblem
        props={props}
        problemId={currentProblemId}
        attemptNumber={attemptNumber}
        masteryState={{ problemIds, correctStreak, goalNum, firstSubmissionResult, modeState, orderMode }}
        handlers={{ setCorrectStreak, setModeState, setCompleted, setCorrect, setFirstSubmissionResult, setAttemptNumber }}
      />
    </div>
  );
}
