// src/components/blocks/display/Explanation/_Explanation.jsx
'use client';
import React from 'react';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { CORRECTNESS, VISIBILITY_HANDLERS, computeVisibility, getGrader } from '@/lib/blocks';
import { renderCompiledKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

/**
 * Explanation displays its children conditionally based on grader state.
 *
 * showWhen options (see VISIBILITY_HANDLERS):
 * - "correct": Show when answer is correct
 * - "answered": Show after valid submission (not invalid)
 * - "attempted": Alias for answered
 * - "always": Always show (useful for debugging)
 * - "never": Never show (hide explanation)
 *
 * Default should be inherited from CapaProblem; currently defaults to 'correct'.
 */
function _Explanation(props) {
  // TODO: Inherit default showWhen from parent CapaProblem
  const { id, kids = [], showWhen = 'correct', title } = props;

  // Find related grader (throws on zero or multiple)
  let targetId;
  try {
    targetId = getGrader(props);
  } catch (e) {
    return (
      <DisplayError
        props={props}
        id={`${id}_grader_error`}
        name="Explanation"
        message={e.message}
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

  // Validate showWhen and compute visibility (throws on invalid option)
  if (!VISIBILITY_HANDLERS[showWhen]) {
    const validOptions = Object.keys(VISIBILITY_HANDLERS).join(', ');
    return (
      <DisplayError
        props={props}
        id={`${id}_invalid_showWhen`}
        name="Explanation"
        message={`Invalid showWhen="${showWhen}".`}
        technical={{
          hint: `Valid options: ${validOptions}`,
          blockId: id
        }}
      />
    );
  }

  if (!computeVisibility(showWhen, { correctness })) {
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
