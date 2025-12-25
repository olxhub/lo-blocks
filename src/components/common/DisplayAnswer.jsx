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
import { useGraderAnswer } from '@/lib/blocks';

export function DisplayAnswer({ props }) {
  const { showAnswer, displayAnswer } = useGraderAnswer(props);
  if (!showAnswer || displayAnswer == null) return null;
  return <span className="lo-show-answer-label">{displayAnswer}</span>;
}

export default DisplayAnswer;
