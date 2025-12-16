// src/lib/blocks/correctness.js
//
// Correctness constants - standardized states for learning assessment.
//
// Defines the possible correctness/completion states that blocks can have,
// following educational technology conventions (similar to edX/LON-CAPA).
// These states are used by grader blocks to indicate student progress and
// are logged to the learning analytics system for tracking.
//
// For examples, states submitted for peer grading might form a
// progression from unsubmitted → submitted → correct/incorrect, with
// additional states for partial credit and validation errors.

export const CORRECTNESS = {
  UNSUBMITTED: 'unsubmitted',
  SUBMITTED: 'submitted',
  CORRECT: 'correct',
  PARTIALLY_CORRECT: 'partially-correct',
  INCORRECT: 'incorrect',
  INCOMPLETE: 'incomplete',
  INVALID: 'invalid'
};

// Derived utilities - single source of truth
const ALL_STATES = new Set(Object.values(CORRECTNESS));

/**
 * Check if a value is a valid correctness state.
 */
export function isValidCorrectness(value) {
  return ALL_STATES.has(value);
}

/**
 * Validate a correctness value. Throws on invalid state (fail-fast).
 */
export function validateCorrectness(value) {
  if (!ALL_STATES.has(value)) {
    const valid = Array.from(ALL_STATES).join(', ');
    throw new Error(`Invalid correctness value: "${value}". Valid values: ${valid}`);
  }
}

/**
 * Get all valid correctness states.
 */
export function getAllCorrectnessStates() {
  return ALL_STATES;
}

/**
 * Ordering for worst-case aggregation (lower = worse).
 * Used by grading aggregators to determine priority.
 */
export const CORRECTNESS_PRIORITY = {
  [CORRECTNESS.INVALID]: 0,
  [CORRECTNESS.UNSUBMITTED]: 1,
  [CORRECTNESS.INCOMPLETE]: 2,
  [CORRECTNESS.SUBMITTED]: 3,
  [CORRECTNESS.INCORRECT]: 4,
  [CORRECTNESS.PARTIALLY_CORRECT]: 5,
  [CORRECTNESS.CORRECT]: 6,
};

/**
 * Visibility handlers for conditional content (Explanation, Answer, etc.)
 *
 * Open edX supports these show_answer options:
 * - "always"                      - Always show
 * - "answered"                    - After valid submission (not unsubmitted or invalid)
 * - "attempted"                   - Alias for answered
 * - "correct"                     - Only when correct
 * - "never"                       - Never show
 *
 * Future (require additional CapaProblem-level state):
 * - "closed"                      - When problem is closed
 * - "finished"                    - When course/section is finished
 * - "past_due"                    - After due date
 * - "correct_or_past_due"         - When correct OR past due
 * - "after_all_attempts"          - After max attempts used
 * - "after_all_attempts_or_correct" - After all attempts OR correct
 * - "attempted_no_past_due"       - Attempted but not past due
 */
export const VISIBILITY_HANDLERS = {
  always: () => true,
  never: () => false,
  answered: ({ correctness }) =>
    correctness !== CORRECTNESS.UNSUBMITTED && correctness !== CORRECTNESS.INVALID,
  attempted: ({ correctness }) =>
    correctness !== CORRECTNESS.UNSUBMITTED && correctness !== CORRECTNESS.INVALID,
  correct: ({ correctness }) => correctness === CORRECTNESS.CORRECT,
};

/**
 * Compute visibility based on showWhen option and problem state.
 *
 * @param {string} showWhen - Visibility option (must be key in VISIBILITY_HANDLERS)
 * @param {Object} state - Problem state
 * @param {string} state.correctness - Current CORRECTNESS state from grader
 * @returns {boolean} - Whether content should be visible
 * @throws {Error} - If showWhen is not a valid option
 */
export function computeVisibility(showWhen, { correctness /* dueDate, attempts, maxAttempts */ } = {}) {
  const handler = VISIBILITY_HANDLERS[showWhen];
  if (!handler) {
    const validOptions = Object.keys(VISIBILITY_HANDLERS).join(', ');
    throw new Error(`Invalid showWhen="${showWhen}". Valid options: ${validOptions}`);
  }
  return handler({ correctness });
}

