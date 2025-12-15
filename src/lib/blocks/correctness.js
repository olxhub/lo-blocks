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

/**
 * Aggregate correctness from multiple graders (for CapaProblem metagrader pattern).
 *
 * @param {string[]} correctnessValues - Array of CORRECTNESS values from child graders
 * @returns {string} - Aggregated CORRECTNESS value
 */
export function aggregateCorrectness(correctnessValues) {
  if (!correctnessValues || correctnessValues.length === 0) {
    return CORRECTNESS.UNSUBMITTED;
  }

  const counts = {
    correct: 0,
    incorrect: 0,
    unsubmitted: 0,
    invalid: 0,
    other: 0
  };

  for (const c of correctnessValues) {
    if (c === CORRECTNESS.CORRECT) counts.correct++;
    else if (c === CORRECTNESS.INCORRECT) counts.incorrect++;
    else if (c === CORRECTNESS.UNSUBMITTED) counts.unsubmitted++;
    else if (c === CORRECTNESS.INVALID) counts.invalid++;
    else counts.other++;
  }

  const total = correctnessValues.length;

  // All unsubmitted → unsubmitted
  if (counts.unsubmitted === total) return CORRECTNESS.UNSUBMITTED;

  // Any invalid → invalid (validation errors block progress)
  if (counts.invalid > 0) return CORRECTNESS.INVALID;

  // All correct → correct
  if (counts.correct === total) return CORRECTNESS.CORRECT;

  // Mix of correct and incorrect → partially correct
  if (counts.correct > 0 && counts.incorrect > 0) return CORRECTNESS.PARTIALLY_CORRECT;

  // All incorrect → incorrect
  if (counts.incorrect === total) return CORRECTNESS.INCORRECT;

  // Some unsubmitted with some answered → incomplete
  if (counts.unsubmitted > 0) return CORRECTNESS.INCOMPLETE;

  // Fallback
  return CORRECTNESS.UNSUBMITTED;
}

