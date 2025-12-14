// src/components/blocks/display/Explanation/_Explanation.jsx
'use client';
import React from 'react';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { CORRECTNESS } from '@/lib/blocks';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { renderCompiledKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

/**
 * Explanation displays its children conditionally based on grader state.
 *
 * showWhen options:
 * - "correct" (default): Show when answer is correct
 * - "answered": Show after any submission (correct or incorrect)
 * - "always": Always show (useful for debugging)
 * - "never": Never show (hide explanation)
 */
function _Explanation(props) {
  const { id, kids = [], target, infer, showWhen = 'correct', title } = props;

  // Find related grader
  const graderIds = inferRelatedNodes(props, {
    selector: n => n.blueprint?.isGrader,
    infer,
    targets: target
  });
  const targetId = graderIds[0];

  // Fail fast if no grader found
  if (!targetId) {
    return (
      <DisplayError
        props={props}
        id={`${id}_no_grader`}
        name="Explanation"
        message="No grader found. Explanation must be nested inside a grader."
        technical={{
          hint: 'Place Explanation inside a grader block (e.g., NumericalGrader, KeyGrader).',
          target: target || '(none specified)',
          infer: infer ?? 'default (parents, kids)',
          blockId: id
        }}
      />
    );
  }

  let correctness = CORRECTNESS.UNSUBMITTED;
  try {
    const correctField = state.componentFieldByName(props, targetId, 'correct');
    correctness = useFieldSelector(
      props,
      correctField,
      { id: targetId, fallback: CORRECTNESS.UNSUBMITTED, selector: s => s?.correct }
    );
    if (correctness == null) correctness = CORRECTNESS.UNSUBMITTED;
  } catch (e) {
    correctness = CORRECTNESS.UNSUBMITTED;
  }

  // Determine visibility
  let visible = false;
  switch (showWhen) {
    case 'always':
      visible = true;
      break;
    case 'never':
      visible = false;
      break;
    case 'answered':
      visible = correctness !== CORRECTNESS.UNSUBMITTED;
      break;
    case 'correct':
    default:
      visible = correctness === CORRECTNESS.CORRECT;
      break;
  }

  if (!visible) {
    return null;
  }

  const heading = title || 'Explanation';

  return (
    <div className="lo-explanation border-l-4 border-blue-500 bg-blue-50 p-4 my-4 rounded-r">
      <div className="lo-explanation__header font-semibold text-blue-800 mb-2">
        {heading}
      </div>
      <div className="lo-explanation__content text-gray-700">
        {renderCompiledKids({ ...props, kids })}
      </div>
    </div>
  );
}

export default _Explanation;
