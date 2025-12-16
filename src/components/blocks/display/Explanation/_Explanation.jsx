// src/components/blocks/display/Explanation/_Explanation.jsx
'use client';
import React from 'react';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { CORRECTNESS, computeVisibility } from '@/lib/blocks';
import { renderCompiledKids } from '@/lib/render';

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
 * Note: requiresGrader=true in block definition means graderId is injected by render.
 * showWhen is validated by attributeSchema at parse time.
 */
function _Explanation(props) {
  // graderId injected by render (requiresGrader: true)
  // showWhen validated by attributeSchema
  const { kids = [], showWhen = 'correct', title, graderId } = props;

  const correctField = state.componentFieldByName(props, graderId, 'correct');
  const correctness = useFieldSelector(
    props,
    correctField,
    { id: graderId, fallback: CORRECTNESS.UNSUBMITTED, selector: s => s?.correct }
  ) ?? CORRECTNESS.UNSUBMITTED;

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
