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
import { FieldInfo } from '../types';
import { scopes } from './scopes';

/**
 * Common field definitions used across multiple block types.
 * Pre-registered at module load time for cross-component access.
 */
export const commonFields = {
  /** Standard value field - used by most input components */
  value: {
    type: 'field',
    name: 'value',
    event: 'UPDATE_VALUE',
    scope: scopes.component
  } as FieldInfo,

  /** Correctness field - used by graders, checked by orchestrators like MasteryBank */
  correct: {
    type: 'field',
    name: 'correct',
    event: 'UPDATE_CORRECT',
    scope: scopes.component
  } as FieldInfo,

  /** Feedback message field - used by graders */
  message: {
    type: 'field',
    name: 'message',
    event: 'UPDATE_MESSAGE',
    scope: scopes.component
  } as FieldInfo,

  /** Submit count field - tracks number of submissions */
  submitCount: {
    type: 'field',
    name: 'submitCount',
    event: 'UPDATE_SUBMIT_COUNT',
    scope: scopes.component
  } as FieldInfo,

  /** Show answer toggle - controls answer display */
  showAnswer: {
    type: 'field',
    name: 'showAnswer',
    event: 'UPDATE_SHOW_ANSWER',
    scope: scopes.component
  } as FieldInfo,
} as const;

// Named exports for convenient destructuring
export const { value, correct, message, submitCount, showAnswer } = commonFields;
