// packages/shared/lib/state/commonFields.ts
//
// Common field constants - typed FieldInfo objects for widely-used fields.
//
// These are fields that are used across multiple block types or need to be
// accessed by blocks that don't own them (e.g., MasteryBank checking a grader's
// 'correct' field).
//
// Use these instead of fieldByName('value') for type safety and autocomplete.
//
// For block-specific fields, use the block's own `fields` export instead:
//   import { fields } from './MyBlock';
//   fields.myCustomField  // Preferred over fieldByName('myCustomField')
//
// NOTE: These are plain (LWW) fields. If a block needs a different storage
// type for the same field name (e.g., TextArea stores 'value' as an RgaDoc),
// it should use a field type constructor like docField('value') instead.
//
import { stateField } from './fieldTypes';

/**
 * Common field definitions used across multiple block types.
 * Pre-registered at module load time for cross-component access.
 *
 * Each is a full LWW field with read, write, reduce, display.
 */
export const commonFields = {
  /** Standard value field - used by most input components */
  value: stateField('value'),

  /** Correctness field - used by graders, checked by orchestrators like MasteryBank */
  correct: stateField('correct'),

  /** Feedback message field - used by graders */
  message: stateField('message'),

  /** Numeric score - used by graders (0-100 or similar) */
  score: stateField('score'),

  /** Captured input values at submission time. Distinct from the live input
   *  value — lets the UI show what was actually graded (e.g., visual indicator
   *  when the input has changed since submission, reset-to-submitted, or
   *  submission history). */
  lastSubmission: stateField('lastSubmission'),

  /** Submit count field - tracks number of submissions */
  submitCount: stateField('submitCount'),

  /** Show answer toggle - controls answer display */
  showAnswer: stateField('showAnswer'),

  /** Popout expanded state - tracks whether a block's popout overlay is open */
  popoutExpanded: stateField('popoutExpanded'),

  /** Render error - captures component render failures for display and debug visibility. */
  renderError: stateField('renderError'),
} as const;

// Named exports for convenient destructuring
export const { value, correct, message, score, lastSubmission, submitCount, showAnswer } = commonFields;

/**
 * Standard grading fields as an array, for use in fields() group syntax:
 *
 *   state.fields([graderFields(), 'customHint'])
 *
 * Returns [correct, message, score, lastSubmission, submitCount, showAnswer] —
 * every field the grader action dispatches plus showAnswer.
 * Using this explicitly is preferred over relying on applyGraderExtensions
 * auto-add, since it makes field declarations honest.
 */
export function graderFields() {
  return [
    commonFields.correct,
    commonFields.message,
    commonFields.score,
    commonFields.lastSubmission,
    commonFields.submitCount,
    commonFields.showAnswer,
  ];
}
