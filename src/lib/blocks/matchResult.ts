// src/lib/blocks/matchResult.ts
//
// MatchResult type for pure match functions.
//
// Match functions are pure predicates that check if student input matches
// an expected pattern. They return a MatchResult instead of boolean to
// provide richer information:
//
//   - match: Input matches the pattern
//   - no_match: Input doesn't match (valid input, wrong answer)
//   - invalid: Student input is malformed (e.g., "abc" for a number)
//   - unsubmitted: Empty or missing input
//
// This enables graders to be auto-generated from match functions by
// mapping states to CORRECTNESS values.
//

export type MatchState = 'match' | 'no_match' | 'invalid' | 'unsubmitted';

export interface MatchResult {
  state: MatchState;
  message?: string;
}

// Convenience constructors
export const MATCH = { state: 'match' as const };
export const NO_MATCH = { state: 'no_match' as const };
export const UNSUBMITTED = { state: 'unsubmitted' as const };

export function invalid(message: string): MatchResult {
  return { state: 'invalid', message };
}

// Type for match functions
export type MatchFunction<TInput = any, TPattern = any, TOptions = Record<string, any>> = (
  input: TInput,
  pattern: TPattern,
  options?: TOptions
) => MatchResult;
