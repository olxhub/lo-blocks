// packages/shared/lib/state/fieldTypes/index.ts
//
// Switch between classic (main-branch) and CRDT field implementations.
//
// Controlled by the LO_FIELD_STRATEGY environment variable:
//   LO_FIELD_STRATEGY=crdt    → CRDT conflict resolution, delta encoding (default)
//   LO_FIELD_STRATEGY=classic → bare values, spread-based reducer
//
// This is the single source of truth for the field strategy. The hook
// switch in state/index.ts reads the same variable.
//
// How it works:
//   - fields.ts imports stateField from here — gets whichever is active
//   - updateField checks field.write — CRDT fields produce delta events,
//     classic fields fall through to simple { [fieldName]: newValue } dispatch
//   - useFieldSelector checks field.read — CRDT fields decode, classic returns raw
//   - store.ts reducer: field.reduce when present, legacy-spread when absent
//
// Classic fields (no write/reduce/read) work correctly with the current
// infrastructure because every code path has a fallback for when those
// properties are absent.
//

import * as classic from './classic';
import * as crdt from './crdt';

// ---------------------------------------------------------------------------
// Active field type strategy
// ---------------------------------------------------------------------------
// Env var checked at module load time. Default: crdt (flipped 2026-07 for
// the pre-rollout soak — the storage model's live layer is CRDT, so the
// default exercises it everywhere, including the full test gate).
// Set LO_FIELD_STRATEGY=classic for the escape hatch.
//
// IMPORTANT: Use `process.env.LO_FIELD_STRATEGY` (direct access, no
// optional chaining) — vite replaces this exact pattern at compile time
// via a `define` entry in apps/client/vite.config.ts (which substitutes
// null when the var is unset, so the ?? default below applies).
export const LO_FIELD_STRATEGY: 'classic' | 'crdt' =
  (process.env.LO_FIELD_STRATEGY as 'classic' | 'crdt' | undefined | null) ?? 'crdt';

const active = LO_FIELD_STRATEGY === 'crdt' ? crdt : classic;

export const stateField = active.stateField;
export const plainField = active.plainField;
export const docField = active.docField;
export const orSetField = active.orSetField;
export const idField = active.idField;

// ---------------------------------------------------------------------------
// Always available regardless of strategy
// ---------------------------------------------------------------------------
// logField has no classic counterpart: an append-only op-keyed log merges
// safely under both strategies, so one implementation serves both.
export { logField } from './crdt/logConstructor';
export { fieldNameToDefaultEventName } from './shared';
export { immediate, debounce, throttle, aggregate, custom } from './batching';
export type { BatchingStrategy } from './batching';

