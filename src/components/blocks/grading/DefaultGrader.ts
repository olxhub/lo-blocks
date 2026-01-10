// src/components/blocks/grading/DefaultGrader.ts
//
// Catch-all grader that accepts any answer with specified score/feedback.
//
// Usage:
//   <DefaultGrader score="1" feedback="Any answer is accepted!">
//     <LineInput/>
//   </DefaultGrader>
//
// Also creates DefaultMatch for use inside RulesGrader:
//   <RulesGrader>
//     <StringMatch answer="correct" score="1"/>
//     <DefaultMatch score="0" feedback="Try again"/>
//     <LineInput/>
//   </RulesGrader>
//
// The pure match function `defaultMatch` is available in DSL expressions:
//   defaultMatch(@answer.value)  // true if non-empty
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';

/**
 * Pure match function - matches any input (always returns true).
 *
 * Note: The framework handles empty input → UNSUBMITTED before calling match.
 * So by the time this is called, input is guaranteed non-empty.
 *
 * @param _input - The student's answer (ignored - always matches)
 * @param _pattern - Ignored (DefaultMatch has no pattern)
 * @returns true (always matches non-empty input)
 */
export function defaultMatch(
  _input: any,
  _pattern?: any
): boolean {
  return true;
}

const DefaultGrader = createGrader({
  base: 'Default',
  description: 'Catch-all grader that accepts any answer with specified score/feedback',
  match: defaultMatch,
  inputSchema: z.string(),  // Single string input
  attributes: {
    // No answer required - Default matches everything
  },
  getDisplayAnswer: () => undefined,
});

export default DefaultGrader;
