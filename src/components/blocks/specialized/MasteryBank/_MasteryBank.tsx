// src/components/blocks/specialized/MasteryBank/_MasteryBank.jsx
'use client';

import React, { useMemo, useEffect, useRef, Suspense } from 'react';
import { useBlock } from '@/lib/render';
import { useReduxState, useFieldSelector, fieldByName } from '@/lib/state';
import { extendIdPrefix, toOlxReference } from '@/lib/blocks/idResolver';
import { CORRECTNESS } from '@/lib/blocks';
import { useOlxJson } from '@/lib/blocks/useOlxJson';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';

/**
 * Fisher-Yates shuffle - returns array of indices [0, length) in random order.
 * Uses Math.random() for true randomness so each student sees a different order.
 */
function shuffleIndices(length) {
  const result = Array.from({ length }, (_, i) => i);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Order modes for problem selection.
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
    initial: (itemCount) => ({ order: shuffleIndices(itemCount), index: 0 }),
    nextItem: (itemCount, state) => {
      const nextIndex = state.index + 1;
      if (nextIndex >= itemCount) {
        const newOrder = shuffleIndices(itemCount);
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
function isGradedAnswer(correctness) {
  return correctness === CORRECTNESS.CORRECT ||
         correctness === CORRECTNESS.INCORRECT ||
         correctness === CORRECTNESS.PARTIALLY_CORRECT;
}

/**
 * Inner component that watches grader state and handles advancement.
 * Separated to allow unconditional hook calls (useFieldSelector requires valid field).
 */
function MasteryProblem({ props, problemId, attemptNumber, masteryState, handlers }) {
  const { id } = props;
  const { problemIds, correctStreak, goalNum, firstSubmissionResult, modeState, orderMode } = masteryState;
  const { setCorrectStreak, setModeState, setCompleted, setCorrect, setFirstSubmissionResult, setAttemptNumber } = handlers;

  const scopedProps = { ...props, ...extendIdPrefix(props, `${id}.attempt_${attemptNumber}`) };
  const problemRef = toOlxReference(problemId, 'MasteryBank problem');
  const scopedGraderRef = toOlxReference(`${problemId}_grader`, 'MasteryBank grader');

  // Load problem block (grader field is now a system field, always available)
  const { olxJson: problemBlock } = useOlxJson(problemRef);

  // Render problem
  const { block: renderedProblem } = useBlock(scopedProps, problemId);

  // HACK: 'correct' is registered as a system field, so fieldByName always works
  // even if the grader block isn't loaded yet. See fields.ts SYSTEM_FIELDS.
  const graderField = fieldByName('correct');

  const currentCorrectness = useFieldSelector(
    scopedProps,
    graderField,
    { id: scopedGraderRef, fallback: CORRECTNESS.UNSUBMITTED, selector: s => s?.correct }
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

    if (currentCorrectness === CORRECTNESS.CORRECT) {
      if (firstSubmissionResult === null) {
        // First try correct - increment streak and advance
        const newStreak = correctStreak + 1;
        setCorrectStreak(newStreak);
        setFirstSubmissionResult(CORRECTNESS.CORRECT);
        if (newStreak >= goalNum) {
          setCompleted(true);
          setCorrect(CORRECTNESS.CORRECT);
        } else {
          setCorrect(CORRECTNESS.INCOMPLETE);
          advanceToNext();
        }
      } else if (firstSubmissionResult === CORRECTNESS.INCORRECT) {
        // Correct after incorrect - advance without incrementing streak
        advanceToNext();
      }
    } else {
      // INCORRECT or PARTIALLY_CORRECT
      if (firstSubmissionResult === null) {
        // First try wrong - reset streak, stay on problem
        setFirstSubmissionResult(CORRECTNESS.INCORRECT);
        setCorrectStreak(0);
        setCorrect(CORRECTNESS.INCOMPLETE);
      }
    }
  }, [currentCorrectness, firstSubmissionResult, correctStreak, goalNum, problemIds.length, modeState, orderMode, attemptNumber, setCorrectStreak, setModeState, setCompleted, setCorrect, setFirstSubmissionResult, setAttemptNumber]);

  if (!problemBlock) {
    return (
      <DisplayError
        props={props}
        name="MasteryBank"
        message={`Problem not found: "${problemId}"`}
        technical={{
          hint: 'Make sure this problem is defined elsewhere in your content.',
          problemId,
          blockId: props.id
        }}
        id={`${props.id}_problem_not_found`}
      />
    );
  }

  return (
    <div className="lo-mastery-bank__problem">
      {renderedProblem as React.ReactNode}
    </div>
  );
}

export default function _MasteryBank(props) {
  const { id, fields, kids, goal = 6, mode = 'linear' } = props;

  const orderMode = ORDER_MODES[mode] || ORDER_MODES.linear;

  const problemIds = useMemo(() => {
    return kids?.problemIds && Array.isArray(kids.problemIds) ? kids.problemIds : [];
  }, [kids]);

  const goalNum = typeof goal === 'string' ? parseInt(goal, 10) : goal;

  const initialModeState = useMemo(() => {
    return problemIds.length > 0 ? orderMode.initial(problemIds.length) : 0;
  }, [problemIds.length, orderMode]);

  const [correctStreak, setCorrectStreak] = useReduxState(props, fields.correctStreak, 0);
  const [completed, setCompleted] = useReduxState(props, fields.completed, false);
  const [, setCorrect] = useReduxState(props, fields.correct, null);
  const [modeState, setModeState] = useReduxState(props, fields.modeState, initialModeState);
  const [firstSubmissionResult, setFirstSubmissionResult] = useReduxState(props, fields.firstSubmissionResult, null);
  const [attemptNumber, setAttemptNumber] = useReduxState(props, fields.attemptNumber, 0);

  // Error: no problems
  if (problemIds.length === 0) {
    return (
      <DisplayError
        props={props}
        name="MasteryBank"
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
        name="MasteryBank"
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
          <h3>Mastery Achieved!</h3>
          <p>You answered {goalNum} questions correctly in a row.</p>
        </div>
      </div>
    );
  }

  const displayPosition = orderMode.position(modeState) + 1;

  return (
    <div className="lo-mastery-bank">
      <div className="lo-mastery-bank__header">
        <div className="lo-mastery-bank__progress">
          Streak: {correctStreak} / {goalNum}
        </div>
        <div className="lo-mastery-bank__count">
          Problem {displayPosition} of {problemIds.length}
        </div>
      </div>

      <Suspense fallback={<Spinner>Loading problem...</Spinner>}>
        <MasteryProblem
          props={props}
          problemId={currentProblemId}
          attemptNumber={attemptNumber}
          masteryState={{ problemIds, correctStreak, goalNum, firstSubmissionResult, modeState, orderMode }}
          handlers={{ setCorrectStreak, setModeState, setCompleted, setCorrect, setFirstSubmissionResult, setAttemptNumber }}
        />
      </Suspense>
    </div>
  );
}
