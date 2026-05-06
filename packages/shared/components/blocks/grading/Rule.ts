// src/components/blocks/grading/Rule.ts
//
// Rule block for RulesGrader - evaluates DSL expressions for matching.
//
// Usage inside RulesGrader:
//   <RulesGrader>
//     <Rule match="stringMatch(input, 'Paris')" score="1" feedback="Correct!" />
//     <Rule match="stringMatch(input, 'paris', { ignoreCase: true })" score="0.5" feedback="Check capitalization" />
//     <Rule match="true" score="0" feedback="Try again" />
//     <LineInput />
//   </RulesGrader>
//
// The `match` attribute is a DSL expression that has access to:
//   - input: The student's answer (single input)
//   - inputs: Array of answers (multi-input graders)
//   - All registered match functions (stringMatch, numericalMatch, etc.)
//
import { z } from 'zod';
import { core, z_reduxStateRef, z_expression } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Noop from '@/components/blocks/layout/_Noop';
import { evaluate, createContext } from '@/lib/stateLanguage/evaluate';
import { correctness } from '@/lib/blocks/correctness';
import type { RuntimeProps } from '@/lib/types';

/**
 * Evaluate the `match` expression and return a grading result.
 *
 * Called by RulesGrader's gradeRules function, which passes
 * the student input(s) in the context parameter.
 */
function matchRule(props: RuntimeProps, context: { input?: any; inputs?: any[] }) {
  const match = props.match;

  if (!match) {
    // No condition means always match (like DefaultMatch)
    return { correct: correctness.correct, message: '' };
  }

  try {
    const evalContext = createContext({
      input: context.input,
      inputs: context.inputs ?? [],
    });

    const result = evaluate(match.ast, evalContext);
    const matched = Boolean(result);

    return {
      correct: matched ? correctness.correct : correctness.incorrect,
      message: '',
    };
  } catch (e) {
    console.error(`[Rule] Failed to evaluate match="${match.expr}":`, e);
    return {
      correct: correctness.incorrect,
      message: `Expression error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

const Rule = core({
  ...parsers.blocks(),
  name: 'Rule',
  description: 'Matching rule that evaluates a DSL expression, used inside RulesGrader',
  category: 'grading',
  component: _Noop,
  internal: true,
  isMatch: true,
  attributes: z.object({
    match: z_expression.optional().describe('DSL expression to evaluate (e.g., stringMatch(input, "Paris"))'),
    score: z.coerce.number().min(0).max(1).optional().describe('Score for this rule (0-1)'),
    feedback: z.string().optional().describe('Feedback message when this rule matches'),
    feedbackBlock: z_reduxStateRef.optional().describe('ID of a block to display as feedback'),
  }).strict(),
  locals: {
    match: matchRule,
  },
});

export default Rule;
