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
// type for the same field name (e.g., TextArea stores 'value' as a JsonUpdate),
// it should use a field type constructor like docField('value') instead.
//
import { stateField } from './fieldTypes';
import type { FieldInfo, LoBlock } from '../types';

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

  /** Durable record of an in-flight async submission ({ id, submittedAt } —
   *  see grading/gradingStore.ts PendingGrade). Written when async grading
   *  starts, cleared when the result lands; its presence + age is how a reader
   *  tells a genuinely-pending grade from a stranded one. */
  pendingGrade: stateField('pendingGrade'),

  /** Show answer toggle - controls answer display */
  showAnswer: stateField('showAnswer'),

  /** Popout expanded state - tracks whether a block's popout overlay is open */
  popoutExpanded: stateField('popoutExpanded'),

  /** Input cursor position, { field, start, end } — written by useInputField
   *  as an `extras` envelope entry riding the value event (never dispatched
   *  standalone, so its auto-derived UPDATE_SELECTION event goes unused).
   *  The bucket holds one selection; `field` names the input that owns it, so
   *  co-bucketed inputs ignore each other's cursor on restore. Declared here
   *  because the binding is generic: any block wired through useInputField
   *  gets cursor tracking without declaring the field itself. */
  selection: stateField('selection'),
} as const;

// Named exports for convenient destructuring
export const { value, correct, message, score, lastSubmission, submitCount, showAnswer } = commonFields;

/**
 * The FieldInfo to decode a block's `value` through: the BLOCK'S OWN when it
 * declares one, else the common LWW shape.
 *
 * Only the block's own FieldInfo carries the right `read`. A getter result is
 * FINAL — level 3 never re-applies field.read (see useFieldSelector in
 * state/fieldHooks.ts) — so whatever the default value read returns is what
 * the component gets. Decoding a docField-valued input through
 * commonFields.value (a plain LWW register with NO read) handed it the raw
 * DocValue envelope instead of text, and the first string method on it threw:
 * `value.trim is not a function` from Freewrite's word counter.
 *
 * Both default value reads go through here — the factory's default input
 * `selectors.value` (blocks/factory.tsx) and the no-getter branch of
 * valueSelector (state/blockValues.ts) — so the two cannot drift.
 */
export function valueFieldFor(loBlock: LoBlock): FieldInfo {
  return loBlock.fields.value ?? commonFields.value;
}

/**
 * Standard grading fields as an array, for use in fields() group syntax:
 *
 *   state.fields([graderFields(), 'customHint'])
 *
 * Returns [correct, message, score, lastSubmission, submitCount, pendingGrade,
 * showAnswer] — every field the grader action dispatches plus showAnswer.
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
    commonFields.pendingGrade,
    commonFields.showAnswer,
  ];
}
