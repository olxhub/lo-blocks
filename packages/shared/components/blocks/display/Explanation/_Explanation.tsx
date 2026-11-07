// packages/shared/components/blocks/display/Explanation/_Explanation.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { computeVisibility, correctness } from '@/lib/blocks';
import { inferRelatedNodes } from '@/lib/blocks/dynamicDom';
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
 * Unless showWhen="never", it also shows once the enclosing problem was given
 * up ("Don't know"): the learner has seen the answer and needs the why.
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

  // The give-up is stored on the problem (the nearest metagrader), which may
  // sit above graderId when the Explanation is inside a leaf grader.
  const [problemKey] = inferRelatedNodes(props, {
    selector: n => n.loBlock.isGrader && !n.loBlock.grading,
    infer: ['parents'],
    closest: true,
  });
  const { correct: problemCorrectness } = useGradingState(props, problemKey ?? graderId);

  // useKids must be called unconditionally
  const { kids } = useKids(props);

  const revealedByGiveUp = problemCorrectness === correctness.gaveUp && showWhen !== 'never';
  if (!revealedByGiveUp && !computeVisibility(showWhen, { correctness: correctnessValue })) {
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
