// src/components/blocks/grading/RulesGrader/RulesGrader.ts
//
// RulesGrader - Grader that evaluates Match rules top-to-bottom.
//
// Contains Match blocks (StringMatch, NumericalMatch, DefaultMatch) as children,
// plus an input block. Evaluates rules against the input, returns first match.
//
// Usage:
//   <RulesGrader>
//     <StringMatch answer="2x" score="1" feedback="Correct!"/>
//     <StringMatch answer="x" score="0.25" feedback="Right variable, wrong coefficient"/>
//     <DefaultMatch score="0" feedback="Try again"/>
//     <LineInput/>
//   </RulesGrader>
//
import { z } from 'zod';
import { core, grader, baseAttributes, isMatch, inferRelatedNodes, refToOlxKey, getBlockByOLXId } from '@/lib/blocks';
import { CORRECTNESS } from '@/lib/blocks/correctness';
import * as parsers from '@/lib/content/parsers';
import _Noop from '@/components/blocks/layout/_Noop';
import type { RuntimeProps } from '@/lib/types';

/**
 * Grade by evaluating child Match rules top-to-bottom, returning first match.
 *
 * @param {Object} props - RulesGrader props including kids
 * @param {Object} context - { input, inputs, inputApi, inputApis }
 * @returns {{ correct: CORRECTNESS, message: string, score?: number }}
 */
function gradeRules(props: RuntimeProps, context) {
  const { blockRegistry } = props;

  // TODO: Handle other CORRECTNESS states (UNSUBMITTED, INCOMPLETE, etc.)
  // Currently delegated to Match rules, but may need RulesGrader-level logic

  // Evaluate child Match rules in order
  const matchIds = inferRelatedNodes(props, {
    selector: n => isMatch(n.loBlock),
    infer: 'kids'
  });
  for (const matchId of matchIds) {
    const childEntry = getBlockByOLXId(props, matchId);
    if (!childEntry) continue;

    const childBlueprint = blockRegistry[childEntry.tag];

    // Attributes are already parsed/transformed at parse time by parseOLX
    const attrs = childEntry.attributes || {};

    // Call the match function
    const matchFn = childBlueprint.locals!.match;
    const matchProps = { ...props, ...attrs };
    const result = matchFn(matchProps, context);

    // Check if this rule matched (correct === CORRECT or true)
    const matched = result.correct === CORRECTNESS.CORRECT || result.correct === true;

    if (matched) {
      // Use score/feedback from attributes
      const score = attrs.score !== undefined ? Number(attrs.score) : 1;
      const feedback = attrs.feedback || result.message || '';

      return {
        correct: score >= 1 ? CORRECTNESS.CORRECT :
                 score > 0 ? CORRECTNESS.PARTIALLY_CORRECT : CORRECTNESS.INCORRECT,
        message: feedback,
        score,
        feedbackBlock: attrs.feedbackBlock,
      };
    }
  }

  // No rule matched - return incorrect with no feedback
  return {
    correct: CORRECTNESS.INCORRECT,
    message: '',
    score: 0,
  };
}

const RulesGrader = core({
  ...parsers.blocks.allowHTML(),
  ...grader({ grader: gradeRules }),
  name: 'RulesGrader',
  description: 'Grader that evaluates Match rules top-to-bottom with partial credit and feedback',
  category: 'grading',
  component: _Noop,
  attributes: baseAttributes.extend({
    target: z.string().optional().describe('ID of the input block to grade (inferred from children if omitted)'),
  }),
  // Display answer: find first Match child with score=1
  getDisplayAnswer: (props: RuntimeProps) => {
    if (props.displayAnswer) return props.displayAnswer;

    const { kids = [], blockRegistry } = props;
    for (const kid of kids) {
      if (kid.type !== 'block') continue;
      const childEntry = getBlockByOLXId(props, kid.id);
      if (!childEntry) continue;

      const childBlueprint = blockRegistry?.[childEntry.tag];
      if (!isMatch(childBlueprint)) continue;

      const attrs = childEntry.attributes || {};
      // Return first rule with score=1 (or no score, implying correct)
      // Attributes are now parsed, so score is a number not a string
      if (attrs.score === 1 || attrs.score === undefined) {
        return attrs.answer || attrs.displayAnswer;
      }
    }
    return undefined;
  },
});

export default RulesGrader;
