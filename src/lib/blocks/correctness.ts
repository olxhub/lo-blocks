// src/lib/blocks/correctness.ts
//
// Two Orthogonal Dimensions: CORRECTNESS and COMPLETION
// ======================================================
//
// Learning activities have two independent dimensions:
//
//   CORRECTNESS - "Did you get it right?" (success/failure)
//   COMPLETION  - "Did you finish it?" (progress/done)
//
// These are orthogonal. You can:
//   - Complete without passing (finished the quiz, got 40%)
//   - Pass without completing (waived due to prior knowledge)
//   - Be in-progress and partially correct (2 of 3 questions done, both right)
//
// This separation follows SCORM 2004's split of `cmi.completion_status` from
// `cmi.success_status`, and cmi5's independent `completed` vs `passed` verbs.
// SCORM 1.2's combined `lesson_status` was a design mistake that caused
// endless confusion about whether "completed" meant "finished" or "passed".
//
// Standards Mapping
// -----------------
// We aim for conceptual compatibility with existing standards without
// contorting to fit their quirks. This enables future interop (e.g., wrapping
// lo-blocks in QTI, emitting xAPI statements, LTI grade passback).
//
// CORRECTNESS maps to:
//   - SCORM 2004: cmi.success_status (passed/failed/unknown)
//   - cmi5: passed/failed verbs
//   - xAPI: http://adlnet.gov/expapi/verbs/passed, .../failed
//   - LTI AGS: gradingProgress + scoreGiven
//   - QTI: outcome variables (SCORE, MAXSCORE)
//
// COMPLETION maps to:
//   - SCORM 2004: cmi.completion_status (not attempted/incomplete/completed)
//   - cmi5: completed verb, satisfied (for aggregation)
//   - xAPI: http://adlnet.gov/expapi/verbs/completed, .../experienced
//   - LTI AGS: activityProgress (Started/InProgress/Completed/Submitted)
//   - Open edX: BlockCompletion (0.0-1.0 per block, aggregated up)
//
// =============================================================================
// CORRECTNESS - Success/Failure States
// =============================================================================
//
// Used by graders to indicate whether the learner's response was right/wrong.
// Logged to analytics for tracking performance.

// Consistent camelCase keys and values. Used directly in DSL as `correctness.correct`.
export const correctness = {
  // Pre-submission states
  unsubmitted: 'unsubmitted',      // No submission yet (maps to xAPI: no statement)
  submitted: 'submitted',          // Awaiting grading (human, LLM, async tests)

  // Graded states
  correct: 'correct',              // Full credit (maps to xAPI/cmi5: passed)
  partiallyCorrect: 'partiallyCorrect',  // Partial credit
  incorrect: 'incorrect',          // No credit (maps to xAPI/cmi5: failed)

  // Edge cases
  incomplete: 'incomplete',        // Partial submission (1 of 3 blanks filled)
  invalid: 'invalid',              // Malformed input ("hello" in numeric field)
} as const;

// =============================================================================
// COMPLETION - Progress/Done States
// =============================================================================
//
// Tracks whether a learner has finished an activity, independent of correctness.
// Used for: progress indicators, prerequisites, navigation gating, TODO lists.
//
// State Transitions
// -----------------
//   NOT_STARTED → IN_PROGRESS    First interaction (typing, clicking, viewing)
//   IN_PROGRESS → DONE           Activity finished (correct answer, survey submitted)
//   IN_PROGRESS → CLOSED         Deadline passed, attempts exhausted
//   NOT_STARTED → SKIPPED        Explicitly bypassed (instructor override, learner skip)
//   NOT_STARTED → CLOSED         Deadline passed without any interaction
//   DONE → CLOSED                (Typically doesn't happen; DONE is terminal)
//
// Standards Mapping
// -----------------
//   NOT_STARTED → SCORM: "not attempted", cmi5: pre-launched, LTI: (no status)
//   IN_PROGRESS → SCORM: "incomplete", cmi5: post-initialized, LTI: "InProgress"
//   DONE        → SCORM: "completed", cmi5: completed verb, LTI: "Completed"
//   SKIPPED     → cmi5: waived verb (requirements met by other means)
//   CLOSED      → cmi5: abandoned* (but we use it for deadline/attempts, not abnormal exit)
//
// Note: cmi5's `satisfied` is an aggregation concept (block satisfied when all
// children are done). We handle this via expressions like:
//   doneWhen="children.every(c => c.completion === completion.done)"
//
// Design Decisions
// ----------------
// - We use "done" rather than "completed" to avoid confusion with correctness.correct
// - "skipped" is for intentional bypass; "closed" is for external constraints
// - Unlike SCORM's "browsed", we don't track view-only mode separately
// - Unlike cmi5, we don't have separate "terminated" - session management is elsewhere

// Consistent camelCase keys and values. Used directly in DSL as `completion.done`.
export const completion = {
  notStarted: 'notStarted',        // No interaction yet
  inProgress: 'inProgress',        // Started but not finished
  done: 'done',                    // Successfully completed
  skipped: 'skipped',              // Explicitly bypassed (waiver, instructor override)
  closed: 'closed',                // Window passed (deadline, max attempts)
} as const;

// Derived utilities - single source of truth
const ALL_CORRECTNESS_STATES = new Set(Object.values(correctness));
const ALL_COMPLETION_STATES = new Set(Object.values(completion));

/**
 * Check if a value is a valid correctness state.
 */
export function isValidCorrectness(value: unknown): boolean {
  return ALL_CORRECTNESS_STATES.has(value as string);
}

/**
 * Validate a correctness value. Throws on invalid state (fail-fast).
 */
export function validateCorrectness(value: unknown): void {
  if (!ALL_CORRECTNESS_STATES.has(value as string)) {
    const valid = Array.from(ALL_CORRECTNESS_STATES).join(', ');
    throw new Error(`Invalid correctness value: "${value}". Valid values: ${valid}`);
  }
}

/**
 * Get all valid correctness states.
 */
export function getAllCorrectnessStates(): Set<string> {
  return ALL_CORRECTNESS_STATES;
}

/**
 * Ordering for worst-case aggregation (lower = worse).
 * Used by grading aggregators to determine priority.
 */
export const correctnessPriority = {
  [correctness.invalid]: 0,
  [correctness.unsubmitted]: 1,
  [correctness.incomplete]: 2,
  [correctness.submitted]: 3,
  [correctness.incorrect]: 4,
  [correctness.partiallyCorrect]: 5,
  [correctness.correct]: 6,
} as const;

// =============================================================================
// COMPLETION Utilities
// =============================================================================

/**
 * Check if a value is a valid completion state.
 */
export function isValidCompletion(value: unknown): boolean {
  return ALL_COMPLETION_STATES.has(value as string);
}

/**
 * Validate a completion value. Throws on invalid state (fail-fast).
 */
export function validateCompletion(value: unknown): void {
  if (!ALL_COMPLETION_STATES.has(value as string)) {
    const valid = Array.from(ALL_COMPLETION_STATES).join(', ');
    throw new Error(`Invalid completion value: "${value}". Valid values: ${valid}`);
  }
}

/**
 * Get all valid completion states.
 */
export function getAllCompletionStates(): Set<string> {
  return ALL_COMPLETION_STATES;
}

/**
 * Ordering for completion progress (lower = less complete).
 * Used for progress aggregation and determining overall completion.
 */
export const completionPriority = {
  [completion.notStarted]: 0,
  [completion.skipped]: 1,       // Skipped counts as "less complete" than in-progress
  [completion.inProgress]: 2,
  [completion.closed]: 3,        // Closed is terminal, counts as more than in-progress
  [completion.done]: 4,          // Done is the ideal terminal state
} as const;

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
export const visibilityHandlers = {
  always: () => true,
  never: () => false,
  answered: ({ correctness: c }: { correctness?: string }) =>
    c !== correctness.unsubmitted && c !== correctness.invalid,
  attempted: ({ correctness: c }: { correctness?: string }) =>
    c !== correctness.unsubmitted && c !== correctness.invalid,
  correct: ({ correctness: c }: { correctness?: string }) => c === correctness.correct,
};

/**
 * Compute visibility based on showWhen option and problem state.
 *
 * @param {string} showWhen - Visibility option (must be key in visibilityHandlers)
 * @param {Object} state - Problem state
 * @param {string} state.correctness - Current correctness state from grader
 * @returns {boolean} - Whether content should be visible
 * @throws {Error} - If showWhen is not a valid option
 */
export function computeVisibility(showWhen: string, { correctness: c /* dueDate, attempts, maxAttempts */ }: { correctness?: string } = {}) {
  const handler = visibilityHandlers[showWhen as keyof typeof visibilityHandlers];
  if (!handler) {
    const validOptions = Object.keys(visibilityHandlers).join(', ');
    throw new Error(`Invalid showWhen="${showWhen}". Valid options: ${validOptions}`);
  }
  return handler({ correctness: c });
}

