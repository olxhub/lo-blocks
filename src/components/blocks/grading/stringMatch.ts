// src/components/blocks/grading/stringMatch.ts
//
// Pure string matching function - no block system dependencies.
//
// This file is separate from StringGrader.ts to avoid circular imports
// when importing the match function from tests or other contexts.
//
import { MATCH, NO_MATCH, UNSUBMITTED, invalid } from '@/lib/blocks/matchResult';
import type { MatchResult } from '@/lib/blocks/matchResult';

/**
 * Options for string matching.
 */
export interface StringMatchOptions {
  /** If true, match is case-insensitive. Default: false */
  ignoreCase?: boolean;
  /** If true, treat pattern as a regular expression. Default: false */
  regexp?: boolean;
}

/**
 * Pure string matching function.
 *
 * This is the core predicate used by StringGrader, usable in:
 * - DSL expressions: stringMatch(@answer.value, 'Paris', { ignoreCase: true })
 * - RulesGrader: <StringMatch answer="Paris" ignoreCase="true" />
 *
 * @param input - The student's answer (will be trimmed)
 * @param pattern - The expected answer or regexp pattern
 * @param options - Match options (ignoreCase, regexp)
 * @returns MatchResult indicating match state
 */
export function stringMatch(
  input: string | null | undefined,
  pattern: string,
  options?: StringMatchOptions
): MatchResult {
  const studentAnswer = (input ?? '').toString().trim();
  const expectedAnswer = (pattern ?? '').toString();

  // Empty input is unsubmitted
  if (studentAnswer === '') return UNSUBMITTED;

  const ignoreCase = options?.ignoreCase === true;
  const isRegexp = options?.regexp === true;

  if (isRegexp) {
    try {
      const flags = ignoreCase ? 'i' : '';
      const regex = new RegExp(`^${expectedAnswer}$`, flags);
      return regex.test(studentAnswer) ? MATCH : NO_MATCH;
    } catch (e) {
      // Invalid regex - this is an author error, should be caught at parse time
      // At runtime we return invalid since we can't grade
      return invalid('Invalid regular expression pattern');
    }
  }

  if (ignoreCase) {
    return studentAnswer.toLowerCase() === expectedAnswer.toLowerCase() ? MATCH : NO_MATCH;
  }

  return studentAnswer === expectedAnswer ? MATCH : NO_MATCH;
}
