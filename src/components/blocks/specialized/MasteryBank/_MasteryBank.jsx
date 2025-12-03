// src/components/blocks/specialized/MasteryBank/_MasteryBank.jsx
'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { render } from '@/lib/render';
import { useReduxState, useFieldSelector, componentFieldByName } from '@/lib/state';
import { CORRECTNESS } from '@/lib/blocks';
import { DisplayError } from '@/lib/util/debug';

/**
 * Fisher-Yates shuffle.
 * Uses Math.random() for true randomness so each student sees a different order.
 */
function shuffleArray(length) {
  const result = Array.from({ length }, (_, i) => i);
  let m = result.length;

  while (m) {
    const i = Math.floor(Math.random() * m--);
    [result[m], result[i]] = [result[i], result[m]];
  }
  return result;
}

/**
 * Order modes for problem selection.
 *
 * Each mode provides:
 *   - initial(itemCount): Returns initial state (optional, defaults to 0)
 *   - nextItem(itemCount, state): Returns [nextItemIndex, newState]
 *
 * The state structure is mode-specific. For simple modes like linear,
 * state is just the current index. For shuffle, state includes the
 * shuffled order array and current position.
 *
 * Future modes to consider:
 *   - linear_then_shuffle: Go through linearly once, then shuffle
 *   - shuffle_once: Shuffle at start, then loop through that order
 *   - shuffle_each_loop: Reshuffle each time we loop back
 *   - random_pick: Pick a random item each time (may repeat)
 */
const ORDER_MODES = {
  // Linear: 0,1,2,0,1,2,0,1,2...
  // State is just the current index
  linear: {
    initial: () => 0,
    nextItem: (itemCount, state) => [(state + 1) % itemCount, (state + 1) % itemCount]
  },
  // Shuffle: randomize order, reshuffle when we loop back
  // State is { order: number[], index: number }
  shuffle: {
    initial: (itemCount) => ({ order: shuffleArray(itemCount), index: 0 }),
    nextItem: (itemCount, state) => {
      const nextIndex = state.index + 1;
      if (nextIndex >= itemCount) {
        // Reshuffle and start over
        const newOrder = shuffleArray(itemCount);
        return [newOrder[0], { order: newOrder, index: 0 }];
      }
      return [state.order[nextIndex], { ...state, index: nextIndex }];
    }
  }
};

/**
 * Get the current item index from mode state.
 * For linear mode, state IS the index. For shuffle, it's state.order[state.index].
 */
function getCurrentItem(mode, state, itemCount) {
  if (mode === 'shuffle' && typeof state === 'object') {
    return state.order[state.index];
  }
  // For linear mode or fallback, state is the index
  return typeof state === 'number' ? state : 0;
}

/**
 * Inner component that renders when we have a valid problem ID.
 * This allows us to call useFieldSelector unconditionally.
 */
function MasteryProblem({ props, currentProblemId, problemIds, correctStreak, goalNum, setCorrectStreak, setModeState, setCompleted, firstSubmissionResult, setFirstSubmissionResult, modeState, orderMode }) {
  const { idMap } = props;

  // Watch the current problem's grader correctness state
  // The grader ID follows the convention: problemId + "_grader"
  const graderId = `${currentProblemId}_grader`;
  const graderField = componentFieldByName(props, graderId, 'correct');

  const currentCorrectness = useFieldSelector(
    props,
    graderField,
    {
      id: graderId,
      fallback: CORRECTNESS.UNSUBMITTED,
      selector: s => s?.correct
    }
  );

  // Track previous correctness to detect state changes
  const prevCorrectnessRef = useRef(currentCorrectness);

  const advanceToNext = () => {
    // Reset first submission tracking for the next problem
    setFirstSubmissionResult(null);

    // Use orderMode to get next item and new state
    const [, newState] = orderMode.nextItem(problemIds.length, modeState);
    setModeState(newState);
  };

  // Handle correctness changes
  // - First incorrect: reset streak, stay on problem (student must get it right to advance)
  // - Correct after incorrect: advance but don't increment streak
  // - First correct: increment streak and advance
  // - INVALID, INCOMPLETE, SUBMITTED: no-ops, let student fix input
  useEffect(() => {
    const prevCorrectness = prevCorrectnessRef.current;
    prevCorrectnessRef.current = currentCorrectness;

    // Only act when correctness actually changes
    if (prevCorrectness === currentCorrectness) {
      return;
    }

    // Ignore transitions that don't involve a real answer
    if (currentCorrectness === CORRECTNESS.UNSUBMITTED ||
        currentCorrectness === CORRECTNESS.INVALID ||
        currentCorrectness === CORRECTNESS.INCOMPLETE ||
        currentCorrectness === CORRECTNESS.SUBMITTED) {
      return;
    }

    if (currentCorrectness === CORRECTNESS.CORRECT) {
      if (firstSubmissionResult === null) {
        // First submission was correct - increment streak
        const newStreak = correctStreak + 1;
        setCorrectStreak(newStreak);
        setFirstSubmissionResult(CORRECTNESS.CORRECT);

        if (newStreak >= goalNum) {
          setCompleted(true);
        } else {
          advanceToNext();
        }
      } else if (firstSubmissionResult === CORRECTNESS.INCORRECT) {
        // Got it right after getting it wrong - advance but don't increment streak
        advanceToNext();
      }
    } else if (currentCorrectness === CORRECTNESS.INCORRECT ||
               currentCorrectness === CORRECTNESS.PARTIALLY_CORRECT) {
      if (firstSubmissionResult === null) {
        // First submission was incorrect - reset streak, stay on problem
        setFirstSubmissionResult(CORRECTNESS.INCORRECT);
        setCorrectStreak(0);
      }
      // If already incorrect, do nothing - student is retrying
    }
  }, [currentCorrectness, firstSubmissionResult, setFirstSubmissionResult, setCorrectStreak, correctStreak, goalNum, setCompleted, problemIds.length, modeState, setModeState, orderMode]);

  // Check if problem exists in idMap
  if (!idMap[currentProblemId]) {
    return (
      <DisplayError
        props={props}
        name="MasteryBank"
        message={`Problem not found: "${currentProblemId}"`}
        technical={{
          hint: 'Make sure this problem is defined elsewhere in your content.',
          problemId: currentProblemId,
          blockId: props.id
        }}
        id={`${props.id}_problem_not_found`}
      />
    );
  }

  const problemNode = { type: 'block', id: currentProblemId };

  return (
    <div className="lo-mastery-bank__problem">
      {render({ ...props, node: problemNode })}
    </div>
  );
}

export default function _MasteryBank(props) {
  const { id, fields, kids, goal = 6, mode = 'linear' } = props;

  // Get the order mode (default to linear if invalid)
  const orderMode = ORDER_MODES[mode] || ORDER_MODES.linear;

  // Extract problem IDs from parsed content
  const problemIds = useMemo(() => {
    if (kids?.problemIds && Array.isArray(kids.problemIds)) {
      return kids.problemIds;
    }
    return [];
  }, [kids]);

  const goalNum = typeof goal === 'string' ? parseInt(goal, 10) : goal;

  // State - initialize mode state using the orderMode's initial function
  const initialModeState = useMemo(() => {
    if (problemIds.length > 0) {
      return orderMode.initial(problemIds.length);
    }
    return 0;
  }, [problemIds.length, orderMode]);

  const [correctStreak, setCorrectStreak] = useReduxState(props, fields.correctStreak, 0);
  const [completed, setCompleted] = useReduxState(props, fields.completed, false);
  const [modeState, setModeState] = useReduxState(props, fields.modeState, initialModeState);
  const [firstSubmissionResult, setFirstSubmissionResult] = useReduxState(props, fields.firstSubmissionResult, null);

  // Get current problem ID using mode-specific state interpretation
  const currentProblemIndex = getCurrentItem(mode, modeState, problemIds.length);
  const currentProblemId = problemIds[currentProblemIndex];

  // Error states - return before we need to watch problem state
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

  if (!currentProblemId) {
    // This shouldn't happen in normal operation, but handle it gracefully
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

  // Get displayable position (1-indexed)
  const displayPosition = (typeof modeState === 'object' ? modeState.index : modeState) + 1;

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

      <MasteryProblem
        props={props}
        currentProblemId={currentProblemId}
        problemIds={problemIds}
        correctStreak={correctStreak}
        goalNum={goalNum}
        setCorrectStreak={setCorrectStreak}
        setModeState={setModeState}
        setCompleted={setCompleted}
        firstSubmissionResult={firstSubmissionResult}
        setFirstSubmissionResult={setFirstSubmissionResult}
        modeState={modeState}
        orderMode={orderMode}
      />
    </div>
  );
}
