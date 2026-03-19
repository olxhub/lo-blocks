// src/components/blocks/grading/Rule.ts
//
// Rule block for RulesGrader - evaluates DSL expressions for matching.
//
// Usage inside RulesGrader:
//   <RulesGrader>
//     <Rule when="stringMatch(input, 'Paris')" score="1" feedback="Correct!" />
//     <Rule when="stringMatch(input, 'paris', { ignoreCase: true })" score="0.5" feedback="Check capitalization" />
//     <Rule when="true" score="0" feedback="Try again" />
//     <LineInput />
//   </RulesGrader>
//
// The `when` attribute is a DSL expression that has access to:
//   - input: The student's answer (single input)
//   - inputs: Array of answers (multi-input graders)
//   - All registered match functions (stringMatch, numericalMatch, etc.)
//
import { z } from 'zod';
import { core, baseAttributes } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Noop from '@/components/blocks/layout/_Noop';
import { parse, tryParse } from '@/lib/stateLanguage/parser';
import { evaluate, createContext } from '@/lib/stateLanguage/evaluate';
import { correctness } from '@/lib/blocks/correctness';
import type { RuntimeProps } from '@/lib/types';

/**
 * Evaluate the `when` expression and return a grading result.
 *
 * This is called by RulesGrader's gradeRules function, which passes
 * the student input(s) in the context parameter.
 */
function matchRule(props: RuntimeProps, context: { input?: any; inputs?: any[] }) {
  const whenExpr = props.when;

  if (!whenExpr) {
    // No condition means always match (like DefaultMatch)
    return { correct: correctness.correct, message: '' };
  }

  try {
    // Parse the expression
    const ast = parse(whenExpr);

    // Create evaluation context with input available
    const evalContext = createContext({
      input: context.input,
      inputs: context.inputs ?? [],
    });

    // Evaluate the expression
    const result = evaluate(ast, evalContext);

    // Convert result to boolean
    const matched = Boolean(result);

    return {
      correct: matched ? correctness.correct : correctness.incorrect,
      message: '',
    };
  } catch (e) {
    // Expression evaluation failed
    console.error(`[Rule] Failed to evaluate when="${whenExpr}":`, e);
    return {
      correct: correctness.incorrect,
      message: `Expression error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Validate the `when` attribute is a valid DSL expression.
 */
function validateRuleAttributes(attrs: Record<string, any>): string[] | undefined {
  const errors: string[] = [];

  if (attrs.when !== undefined && attrs.when !== '') {
    const ast = tryParse(attrs.when);
    if (ast === null) {
      errors.push(`when: Invalid expression "${attrs.when}". Check syntax.`);
    }
  }

  return errors.length > 0 ? errors : undefined;
}

const Rule = core({
  ...parsers.blocks(),
  name: 'Rule',
  description: 'Matching rule that evaluates a DSL expression, used inside RulesGrader',
  category: 'grading',
  component: _Noop,
  internal: true,  // Hide from main docs - used inside RulesGrader
  isMatch: true,   // Mark as a Match block (used by RulesGrader)
  attributes: baseAttributes.extend({
    when: z.string().optional().describe('DSL expression to evaluate (e.g., stringMatch(input, "Paris"))'),
    score: z.coerce.number().min(0).max(1).optional().describe('Score for this rule (0-1)'),
    feedback: z.string().optional().describe('Feedback message when this rule matches'),
    feedbackBlock: z.string().optional().describe('ID of a block to display as feedback'),
  }).strict(),
  validateAttributes: validateRuleAttributes,
  locals: {
    match: matchRule,
  },
});

export default Rule;
