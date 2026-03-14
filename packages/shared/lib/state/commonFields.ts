// src/lib/state/commonFields.ts
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
// NOTE: These are plain (identity-read) fields. If a block needs a different
// storage type for the same field name (e.g., TextArea stores 'value' as an
// RgaDoc), it should use a field type constructor like docField('value')
// instead of commonFields.value.
//
import { FieldInfo, FieldName, FieldEvent } from '../types';
import { scopes } from './scopes';

/** Helper to construct a common field with both `events` and deprecated `event`. */
function common(name: string, event: string): FieldInfo {
  return {
    type: 'field',
    name: name as FieldName,
    events: [event as FieldEvent],
    event,
    scope: scopes.component,
  };
}

/**
 * Common field definitions used across multiple block types.
 * Pre-registered at module load time for cross-component access.
 */
export const commonFields = {
  /** Standard value field - used by most input components */
  value: common('value', 'UPDATE_VALUE'),

  /** Correctness field - used by graders, checked by orchestrators like MasteryBank */
  correct: common('correct', 'UPDATE_CORRECT'),

  /** Feedback message field - used by graders */
  message: common('message', 'UPDATE_MESSAGE'),

  /** Submit count field - tracks number of submissions */
  submitCount: common('submitCount', 'UPDATE_SUBMIT_COUNT'),

  /** Show answer toggle - controls answer display */
  showAnswer: common('showAnswer', 'UPDATE_SHOW_ANSWER'),
} as const;

// Named exports for convenient destructuring
export const { value, correct, message, submitCount, showAnswer } = commonFields;
