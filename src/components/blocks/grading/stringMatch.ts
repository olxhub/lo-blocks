// src/components/blocks/grading/stringMatch.ts
//
// Pure string matching function - no block system dependencies.
//
// This file is separate from StringGrader.ts to avoid circular imports
// when importing the match function from tests or other contexts.
//

/**
 * Validate StringGrader attributes at parse time.
 * Returns array of error messages or undefined if valid.
 */
export function validateStringAttributes(attrs: Record<string, any>): string[] | undefined {
  const errors: string[] = [];

  // If regexp=true, validate that the answer is a valid regex pattern
  if (attrs.regexp === true && attrs.answer !== undefined) {
    try {
      new RegExp(attrs.answer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`answer: Invalid regular expression "${attrs.answer}". ${msg}`);
    }
  }

  return errors.length > 0 ? errors : undefined;
}

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
 * Pure string matching function (boolean predicate).
 *
 * This is the core predicate used by StringGrader, usable in:
 * - DSL expressions: stringMatch(@answer.value, 'Paris', { ignoreCase: true })
 * - RulesGrader: <StringMatch answer="Paris" ignoreCase="true" />
 *
 * Note: Assumes input has been validated (non-empty). The framework handles
 * empty input (→ UNSUBMITTED) before calling this function.
 *
 * @param input - The student's answer (will be trimmed)
 * @param pattern - The expected answer or regexp pattern
 * @param options - Match options (ignoreCase, regexp)
 * @returns true if input matches pattern
 */
export function stringMatch(
  input: string,
  pattern: string,
  options?: StringMatchOptions
): boolean {
  const studentAnswer = (input ?? '').toString().trim();
  const expectedAnswer = (pattern ?? '').toString();

  const ignoreCase = options?.ignoreCase === true;
  const isRegexp = options?.regexp === true;

  if (isRegexp) {
    try {
      const flags = ignoreCase ? 'i' : '';
      const regex = new RegExp(`^${expectedAnswer}$`, flags);
      return regex.test(studentAnswer);
    } catch (e) {
      // Invalid regex - this is an author error, should be caught at parse time
      // At runtime, throw to let framework handle as INVALID
      throw new Error('Invalid regular expression pattern');
    }
  }

  if (ignoreCase) {
    return studentAnswer.toLowerCase() === expectedAnswer.toLowerCase();
  }

  return studentAnswer === expectedAnswer;
}
