// src/lib/blocks/createGrader.js
//
// Factory function for creating grader blocks with minimal boilerplate.
//
// When you call createGrader({ base: 'String', ... }), it creates TWO blocks:
// - StringGrader: A full grader block that connects to inputs
// - StringMatch: A matching rule for use inside RulesGrader
//
// The author only writes the grading function and attributes once.
//
// Usage:
//   export default createGrader({
//     base: 'String',
//     description: 'Grades text answers',
//     grader: gradeString,
//     attributes: {
//       answer: z.string({ required_error: 'answer is required' }),
//       regexp: strictBoolean,
//       ignoreCase: strictBoolean,
//     },
//   });
//
import { z } from 'zod';
import { core } from './namespaces';
import * as parsers from '@/lib/content/parsers';
import { grader } from './actions';
import { graderAttributes, baseAttributes } from './attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';
import type { RuntimeProps, LocalsAPI } from '@/lib/types';

// Registry of Match blocks created by createGrader
// componentMap.js will merge these in
export const MATCH_BLOCKS = {};

// Shared attributes for rules (score, feedback, feedbackBlock)
const RULE_ATTRIBUTES = {
  score: z.coerce.number().min(0).max(1).optional(),
  feedback: z.string().optional(),
  feedbackBlock: z.string().optional(),
};

/**
 * Create a grader block (and its Match variant) with minimal boilerplate.
 *
 * @param {Object} config
 * @param {string} config.base - Base name (e.g., 'String' creates StringGrader + StringMatch)
 * @param {string} config.description - Documentation description
 * @param {Function} config.grader - Grading/matching function: (props, { input }) => { correct, message }
 * @param {Object} config.attributes - Zod schema fields specific to this grader
 * @param {Function} [config.getDisplayAnswer] - Optional, returns answer for "Show Answer"
 * @param {Object} [config.locals] - Optional locals API functions
 *
 * @returns {Block} The Grader block (Match variant is auto-registered)
 */
interface CreateGraderConfig {
  base: string;
  description: string;
  grader: (props: RuntimeProps, params: { input?: any; inputs?: any[] }) => { correct: any; message: any };
  attributes?: Record<string, any>;
  getDisplayAnswer?: (props: RuntimeProps) => any;
  locals?: LocalsAPI;
}

export function createGrader({
  base,
  description,
  grader: graderFn,
  attributes = {},
  getDisplayAnswer,
  locals,
}: CreateGraderConfig) {
  const graderName = `${base}Grader`;
  const matchName = `${base}Match`;

  // Create the full Grader block (connects to inputs, grades them)
  const graderBlock = core({
    ...parsers.blocks.allowHTML(),
    ...grader({ grader: graderFn }),
    name: graderName,
    description,
    category: 'grading',
    component: _Noop,
    attributes: graderAttributes.extend(attributes),
    getDisplayAnswer: getDisplayAnswer ?? ((props: RuntimeProps) => props.displayAnswer ?? props.answer),
  }, locals);

  // Create the Match block (a rule for use inside RulesGrader)
  // Match blocks don't connect to inputs - they just define matching logic
  const matchBlock = core({
    ...parsers.blocks(),  // No allowHTML needed for simple rules
    name: matchName,
    description: `Matching rule for ${base} patterns, used inside RulesGrader`,
    category: 'grading',
    component: _Noop,
    internal: true,  // Hide from main docs - it's used inside RulesGrader
    isMatch: true,   // Mark as a Match block (used by RulesGrader)
    // Use strict() to catch attribute typos like bob="doo"
    attributes: baseAttributes.extend({
      ...RULE_ATTRIBUTES,
      ...attributes,
    }).strict(),
    // Store the matching function so RulesGrader can call it
    locals: {
      match: graderFn,
      ...(locals || {}),
    },
  });

  // Register the Match block for componentMap to pick up
  MATCH_BLOCKS[matchName] = matchBlock;

  // Return only the Grader block (the default export)
  return graderBlock;
}

export default createGrader;
