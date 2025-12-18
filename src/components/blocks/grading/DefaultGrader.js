// src/components/blocks/grading/DefaultGrader.js
//
// DefaultGrader - standalone catch-all grader.
//
// Unlike DefaultMatch (used inside RulesGrader), DefaultGrader is a full
// grader that can wrap inputs directly. It always returns the specified
// score/feedback regardless of input.
//
// Usage:
//   <DefaultGrader score="0" feedback="Any answer is accepted">
//     <LineInput/>
//   </DefaultGrader>
//
import { z } from 'zod';
import { core, grader, baseAttributes } from '@/lib/blocks';
import { CORRECTNESS } from '@/lib/blocks/correctness.js';
import * as parsers from '@/lib/content/parsers';
import _Noop from '@/components/blocks/layout/_Noop';

/**
 * DefaultGrader always "matches" any non-empty input.
 */
function gradeDefault(props, { input }) {
  if (input === undefined || input === null || input === '') {
    return { correct: CORRECTNESS.UNSUBMITTED, message: '' };
  }

  const score = props.score !== undefined ? parseFloat(props.score) : 0;
  const correctness = score >= 1 ? CORRECTNESS.CORRECT :
                      score > 0 ? CORRECTNESS.PARTIALLY_CORRECT :
                      CORRECTNESS.INCORRECT;

  return {
    correct: correctness,
    message: props.feedback || '',
    score,
  };
}

const DefaultGrader = core({
  ...parsers.blocks.allowHTML(),
  ...grader({ grader: gradeDefault }),
  name: 'DefaultGrader',
  description: 'Catch-all grader that accepts any answer with specified score/feedback',
  category: 'grading',
  component: _Noop,
  attributes: baseAttributes.extend({
    target: z.string().optional(),
    score: z.coerce.number().min(0).max(1).optional(),
    feedback: z.string().optional(),
    feedbackBlock: z.string().optional(),
  }),
  getDisplayAnswer: () => undefined,
});

export default DefaultGrader;
