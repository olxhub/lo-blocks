// src/components/blocks/specialized/MasteryBank/_MasteryBank.jsx
'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { render } from '@/lib/render';
import { useReduxState, useFieldSelector, componentFieldByName } from '@/lib/state';
import { CORRECTNESS } from '@/lib/blocks';

/**
 * Fisher-Yates shuffle.
 * Uses Math.random() for true randomness so each student sees a different order.
 */
function shuffleArray(array) {
  const result = [...array];
  let m = result.length;

  while (m) {
    const i = Math.floor(Math.random() * m--);
    [result[m], result[i]] = [result[i], result[m]];
  }
  return result;
}

/**
 * Inner component that renders when we have a valid problem ID.
 * This allows us to call useFieldSelector unconditionally.
 */
function MasteryProblem({ props, currentProblemId, currentIndex, problemIds, correctStreak, goalNum, setCurrentIndex, setCorrectStreak, setShuffledOrder, setCompleted, firstSubmissionResult, setFirstSubmissionResult }) {
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

  // Track previous correctness to detect first submission
  const prevCorrectnessRef = useRef(currentCorrectness);

  // Capture first submission result when correctness changes from UNSUBMITTED
  useEffect(() => {
    const prevCorrectness = prevCorrectnessRef.current;
    prevCorrectnessRef.current = currentCorrectness;

    // Only capture if we haven't recorded a first submission yet
    // and correctness just changed from UNSUBMITTED to something else
    if (firstSubmissionResult === null &&
        prevCorrectness === CORRECTNESS.UNSUBMITTED &&
        currentCorrectness !== CORRECTNESS.UNSUBMITTED) {
      if (currentCorrectness === CORRECTNESS.CORRECT) {
        setFirstSubmissionResult('correct');
      } else if (currentCorrectness === CORRECTNESS.INCORRECT) {
        setFirstSubmissionResult('incorrect');
      }
    }
  }, [currentCorrectness, firstSubmissionResult, setFirstSubmissionResult]);

  // Handle next button click - use firstSubmissionResult for streak calculation
  const handleNext = () => {
    if (firstSubmissionResult === 'correct') {
      const newStreak = correctStreak + 1;
      setCorrectStreak(newStreak);

      if (newStreak >= goalNum) {
        setCompleted(true);
      } else {
        advanceToNext();
      }
    } else if (firstSubmissionResult === 'incorrect') {
      setCorrectStreak(0);
      advanceToNext();
    }
  };

  const advanceToNext = () => {
    // Reset first submission tracking for the next problem
    setFirstSubmissionResult(null);

    const nextIndex = currentIndex + 1;
    if (nextIndex >= problemIds.length) {
      const indices = Array.from({ length: problemIds.length }, (_, i) => i);
      setShuffledOrder(shuffleArray(indices));
      setCurrentIndex(0);
    } else {
      setCurrentIndex(nextIndex);
    }
  };

  // Check if problem exists in idMap
  if (!idMap[currentProblemId]) {
    return (
      <div className="lo-mastery-bank lo-mastery-bank--error">
        <p>Problem not found: <code>{currentProblemId}</code></p>
        <p>Make sure this problem is defined elsewhere in your content.</p>
      </div>
    );
  }

  const problemNode = { type: 'block', id: currentProblemId };

  // Show Next button once we have a first submission result
  const showNextButton = firstSubmissionResult !== null;

  return (
    <>
      <div className="lo-mastery-bank__problem">
        {render({ ...props, node: problemNode })}
      </div>

      {showNextButton && (
        <div className="lo-mastery-bank__footer">
          <button
            className="lo-mastery-bank__next-btn"
            onClick={handleNext}
          >
            Next Problem →
          </button>
        </div>
      )}
    </>
  );
}

export default function _MasteryBank(props) {
  const { id, fields, kids, goal = 6 } = props;

  // Extract problem IDs from parsed content
  const problemIds = useMemo(() => {
    if (kids?.problemIds && Array.isArray(kids.problemIds)) {
      return kids.problemIds;
    }
    return [];
  }, [kids]);

  const goalNum = typeof goal === 'string' ? parseInt(goal, 10) : goal;

  // State - initialize shuffledOrder immediately if we have problems
  const initialShuffledOrder = useMemo(() => {
    if (problemIds.length > 0) {
      const indices = Array.from({ length: problemIds.length }, (_, i) => i);
      return shuffleArray(indices);
    }
    return [];
  }, [problemIds.length]); // Only depends on length to avoid reshuffling on every render

  const [currentIndex, setCurrentIndex] = useReduxState(props, fields.currentIndex, 0);
  const [correctStreak, setCorrectStreak] = useReduxState(props, fields.correctStreak, 0);
  const [completed, setCompleted] = useReduxState(props, fields.completed, false);
  const [shuffledOrder, setShuffledOrder] = useReduxState(props, fields.shuffledOrder, initialShuffledOrder);
  const [firstSubmissionResult, setFirstSubmissionResult] = useReduxState(props, fields.firstSubmissionResult, null);

  // Get current problem ID
  const currentProblemIndex = shuffledOrder?.[currentIndex % problemIds.length];
  const currentProblemId = problemIds[currentProblemIndex];

  // Error states - return before we need to watch problem state
  if (problemIds.length === 0) {
    return (
      <div className="lo-mastery-bank lo-mastery-bank--error">
        <p>No problems found in MasteryBank. Add problem IDs as content.</p>
      </div>
    );
  }

  if (!currentProblemId) {
    return (
      <div className="lo-mastery-bank lo-mastery-bank--loading">
        <p>Loading...</p>
      </div>
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

  return (
    <div className="lo-mastery-bank">
      <div className="lo-mastery-bank__header">
        <div className="lo-mastery-bank__progress">
          Streak: {correctStreak} / {goalNum}
        </div>
        <div className="lo-mastery-bank__count">
          Problem {currentIndex + 1} of {problemIds.length}
        </div>
      </div>

      <MasteryProblem
        props={props}
        currentProblemId={currentProblemId}
        currentIndex={currentIndex}
        problemIds={problemIds}
        correctStreak={correctStreak}
        goalNum={goalNum}
        setCurrentIndex={setCurrentIndex}
        setCorrectStreak={setCorrectStreak}
        setShuffledOrder={setShuffledOrder}
        setCompleted={setCompleted}
        firstSubmissionResult={firstSubmissionResult}
        setFirstSubmissionResult={setFirstSubmissionResult}
      />
    </div>
  );
}
