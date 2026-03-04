// src/components/common/DisplayAnswer.jsx
//
// Displays the correct answer when a grader's "Show Answer" is active.
// Calls useGraderAnswer internally - just pass the component props.
//
// Usage:
//   <input ... />
//   <DisplayAnswer props={props} />
//
'use client';

import React from 'react';
import { useGraderAnswer, findGrader } from '@/lib/blocks';

/**
 * Helper component that always calls useGraderAnswer.
 * Only rendered when a grader exists, so hook is always valid.
 */
function DisplayAnswerContent({ props }) {
  const { showAnswer, displayAnswer } = useGraderAnswer(props);
  if (!showAnswer || displayAnswer == null) return null;
  return <span className="lo-show-answer-label">{displayAnswer}</span>;
}

/**
 * Wrapper that conditionally renders DisplayAnswerContent.
 * If no grader exists, renders nothing (no hooks called).
 */
export function DisplayAnswer({ props }) {
  const hasGrader = findGrader(props) !== null;
  if (!hasGrader) return null;
  return <DisplayAnswerContent props={props} />;
}

export default DisplayAnswer;
