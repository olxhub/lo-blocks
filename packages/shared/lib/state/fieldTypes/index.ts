// packages/shared/lib/state/fieldTypes/index.ts
//
// Switch between classic (main-branch) and CRDT field implementations.
//
// Controlled by the NEXT_PUBLIC_LO_FIELD_STRATEGY environment variable:
//   NEXT_PUBLIC_LO_FIELD_STRATEGY=crdt    → LWW/RGA conflict resolution, delta encoding
//   NEXT_PUBLIC_LO_FIELD_STRATEGY=classic → bare values, spread-based reducer (default)
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
// Set NEXT_PUBLIC_LO_FIELD_STRATEGY=classic for the escape hatch.
//
// IMPORTANT: Use `process.env.NEXT_PUBLIC_*` (direct access, no optional
// chaining) — both bundlers replace this exact pattern at compile time:
// Next.js/Turbopack natively; the vite client via a `define` entry in
// apps/client/vite.config.ts (which substitutes null when the var is
// unset, so the ?? default below applies).
export const NEXT_PUBLIC_LO_FIELD_STRATEGY: 'classic' | 'crdt' =
  (process.env.NEXT_PUBLIC_LO_FIELD_STRATEGY as 'classic' | 'crdt' | undefined | null) ?? 'crdt';

const active = NEXT_PUBLIC_LO_FIELD_STRATEGY === 'crdt' ? crdt : classic;

export const stateField = active.stateField;
export const plainField = active.plainField;
export const docField = active.docField;
export const setField = active.setField;
export const idField = active.idField;

// ---------------------------------------------------------------------------
// Always available regardless of strategy
// ---------------------------------------------------------------------------
export { fieldNameToDefaultEventName } from './shared';
export { immediate, debounce, throttle, aggregate, custom } from './batching';
export type { BatchingStrategy } from './batching';

