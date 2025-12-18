// src/components/blocks/grading/DefaultMatch.js
//
// DefaultMatch - catch-all rule that always matches, for use inside RulesGrader.
//
// Usage (inside RulesGrader):
//   <DefaultMatch score="0" feedback="Try again"/>
//
// Should be the last child in a RulesGrader to handle unmatched inputs.
//
import { z } from 'zod';
import { core, baseAttributes } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Noop from '@/components/blocks/layout/_Noop';

// Shared attributes for rules (score, feedback, feedbackBlock)
const RULE_ATTRIBUTES = {
  score: z.coerce.number().min(0).max(1).optional(),
  feedback: z.string().optional(),
  feedbackBlock: z.string().optional(),
};

const DefaultMatch = core({
  ...parsers.blocks(),
  name: 'DefaultMatch',
  description: 'Catch-all matching rule that always matches, for use as last rule in RulesGrader',
  category: 'grading',
  component: _Noop,
  internal: true,  // Used inside RulesGrader, not standalone
  attributes: baseAttributes.extend({
    ...RULE_ATTRIBUTES,
  }),
  // No match function needed - RulesGrader handles DefaultMatch specially
});

export default DefaultMatch;
