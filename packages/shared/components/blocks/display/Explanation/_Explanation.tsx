// src/components/blocks/display/Explanation/_Explanation.jsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { refToReduxKey } from '@/lib/types/id';
import { correctness, computeVisibility } from '@/lib/blocks';
import { useKids } from '@/lib/render';

/**
 * Explanation displays its children conditionally based on grader state.
 *
 * showWhen options (see visibilityHandlers):
 * - "correct": Show when answer is correct
 * - "answered": Show after valid submission (not invalid)
 * - "attempted": Alias for answered
 * - "always": Always show (useful for debugging)
 * - "never": Never show (hide explanation)
 *
 * Note: requiresGrader=true in block definition means graderId is injected by render.
 * showWhen is validated by attributes schema at parse time.
 */
function _Explanation(props: RuntimeProps) {
  // graderId injected by render (requiresGrader: true)
  // showWhen validated by attributes schema
  const { showWhen = 'correct', title, graderId } = props;

  const correctField = state.componentFieldByName(props, graderId, 'correct');
  const graderReduxKey = refToReduxKey({ ...props, id: graderId });
  const correctnessValue = useFieldSelector(
    props,
    correctField,
    { reduxKey: graderReduxKey, fallback: correctness.unsubmitted, selector: s => s?.correct }
  ) ?? correctness.unsubmitted;

  // useKids must be called unconditionally
  const { kids } = useKids(props);

  if (!computeVisibility(showWhen, { correctness: correctnessValue })) {
    return null;
  }

  const heading = title || 'Explanation';

  return (
    <div className="lo-explanation border-l-4 border-accent bg-accent-subtle p-4 my-4 rounded-r">
      <div className="lo-explanation__header font-semibold text-accent mb-2">
        {heading}
      </div>
      <div className="lo-explanation__content text-secondary">
        {kids}
      </div>
    </div>
  );
}

export default _Explanation;
