// src/lib/state/scopes.ts
//
// State scopes - defines the different levels of state management in Learning Observer.
//
// The system organizes Redux state into hierarchical scopes to handle different
// types of data with appropriate lifecycle and sharing semantics:
//
// - `component`: Per-instance state for individual blocks (most common)
// - `componentSetting`: Shared settings for all blocks of the same type
// - `system`: Global application state and preferences
// - `storage`: File/content storage state (for editors and persistence)
//
// Each scope has different Redux store organization and event handling,
// allowing fine-grained control over state isolation vs. sharing.
//
import { enumdict } from '../util';

export const scopeNames = [
  'component',         // Per OLX ID
  'componentSetting',  // Per XML tag (e.g. video)
  'system',            // Global
  'storage'            // File storage (e.g. editor)
] as const;

export const scopes = enumdict(scopeNames);
export type Scope = typeof scopeNames[number];

// Thin helper so legacy code can keep string literals a bit longer if needed.
export function asScope(value: string): Scope {
  return value as Scope;
}
