// packages/shared/components/blocks/display/Explanation/_Explanation.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { computeVisibility } from '@/lib/blocks';
import { useGradingState } from '@/lib/grading';
import { useKids } from '@/lib/player/client/render';

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
function Explanation(props: RuntimeProps) {
  // graderId is a StateKey injected by render (requiresGrader: true)
  // showWhen validated by attributes schema
  const { showWhen = 'correct', title, graderId } = props;

  // Works for leaf graders and metagraders alike — metagrader correctness
  // is derived from children, not stored.
  const { correct: correctnessValue } = useGradingState(props, graderId);

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

export default Explanation;
