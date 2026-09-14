// packages/shared/lib/state/scopes.ts
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

/**
 * Is this scope ONE flat field map (scope → field → value) rather than a
 * map of buckets (scope → bucketId → field → value)?
 *
 * `system` is global, so it has no bucket key and its state sits one level
 * shallower than every other scope. Anything that walks scopes GENERICALLY
 * has to branch on this, and code that forgets does not fail loudly: it
 * reads each system FIELD as if it were a bucket id and each field VALUE
 * as if it were a bucket. Spreading a string "bucket" then explodes it
 * into {0:'l',1:'o',…} and a numeric one into {} — which is how
 * `system.locale.actor` reached the field store as a character map
 * (2026-08). persistence.ts has always special-cased it (SYSTEM_BUCKET);
 * this is that same fact, named, so the next generic walk can ask.
 */
export function isFlatScope(scope: string): boolean {
  return scope === scopes.system;
}
