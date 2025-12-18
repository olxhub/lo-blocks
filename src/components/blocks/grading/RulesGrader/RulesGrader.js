// src/components/blocks/grading/RulesGrader/RulesGrader.js
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
import { core, grader, baseAttributes } from '@/lib/blocks';
import { CORRECTNESS } from '@/lib/blocks/correctness.js';
import * as parsers from '@/lib/content/parsers';
import _Noop from '@/components/blocks/layout/_Noop';

/**
 * Check if a block is a Match rule (has locals.match function)
 */
function isMatchBlock(blueprint) {
  return typeof blueprint?.locals?.match === 'function';
}

/**
 * Check if a block is DefaultMatch
 */
function isDefaultMatch(tag) {
  return tag === 'DefaultMatch';
}

/**
 * Grade by evaluating child Match rules top-to-bottom, returning first match.
 *
 * @param {Object} props - RulesGrader props including kids
 * @param {Object} context - { input, inputs, inputApi, inputApis }
 * @returns {{ correct: CORRECTNESS, message: string, score?: number }}
 */
function gradeRules(props, context) {
  const { kids = [], idMap, componentMap } = props;
  const { input } = context;

  // Handle empty input
  if (input === undefined || input === null || input === '') {
    return { correct: CORRECTNESS.UNSUBMITTED, message: '' };
  }

  // Evaluate child Match rules in order
  for (const kid of kids) {
    if (kid.type !== 'block') continue;

    const childEntry = idMap[kid.id];
    if (!childEntry) continue;

    const childBlueprint = componentMap[childEntry.tag];

    // Skip non-Match blocks (like LineInput)
    if (!isMatchBlock(childBlueprint) && !isDefaultMatch(childEntry.tag)) {
      continue;
    }

    const attrs = childEntry.attributes || {};

    // DefaultMatch always matches
    if (isDefaultMatch(childEntry.tag)) {
      const score = attrs.score !== undefined ? parseFloat(attrs.score) : 0;
      return {
        correct: score >= 1 ? CORRECTNESS.CORRECT :
                 score > 0 ? CORRECTNESS.PARTIALLY_CORRECT : CORRECTNESS.INCORRECT,
        message: attrs.feedback || '',
        score,
        feedbackBlock: attrs.feedbackBlock,
      };
    }

    // Call the match function
    // Parse attributes through the Match block's schema to get proper types
    // (e.g., "true" -> true for booleans)
    const matchFn = childBlueprint.locals.match;
    let parsedAttrs = attrs;
    if (childBlueprint.blueprint?.attributes?.safeParse) {
      const parseResult = childBlueprint.blueprint.attributes.safeParse(attrs);
      if (parseResult.success) {
        parsedAttrs = parseResult.data;
      }
    }
    const matchProps = { ...props, ...parsedAttrs };
    const result = matchFn(matchProps, context);

    // Check if this rule matched (correct === CORRECT or true)
    const matched = result.correct === CORRECTNESS.CORRECT || result.correct === true;

    if (matched) {
      // Use score/feedback from attributes
      const score = attrs.score !== undefined ? parseFloat(attrs.score) : 1;
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
    target: z.string().optional(),
  }),
  // Display answer: find first Match child with score=1
  getDisplayAnswer: (props) => {
    if (props.displayAnswer) return props.displayAnswer;

    const { kids = [], idMap, componentMap } = props;
    for (const kid of kids) {
      if (kid.type !== 'block') continue;
      const childEntry = idMap[kid.id];
      if (!childEntry) continue;

      const childBlueprint = componentMap?.[childEntry.tag];
      if (!isMatchBlock(childBlueprint)) continue;

      const attrs = childEntry.attributes || {};
      // Return first rule with score=1 (or no score, implying correct)
      if (attrs.score === '1' || attrs.score === 1 || attrs.score === undefined) {
        return attrs.answer || attrs.displayAnswer;
      }
    }
    return undefined;
  },
});

export default RulesGrader;
