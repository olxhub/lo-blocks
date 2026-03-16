// lib/state/fieldTypes/index.ts
//
// Switch between classic (main-branch) and CRDT field implementations.
//
// Controlled by the LO_FIELD_STRATEGY environment variable:
//   LO_FIELD_STRATEGY=crdt    → LWW/RGA conflict resolution, delta encoding
//   LO_FIELD_STRATEGY=classic → bare values, spread-based reducer (default)
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
// Env var checked at module load time. Default: classic.
// Set LO_FIELD_STRATEGY=crdt to enable CRDT field types.
export const LO_FIELD_STRATEGY: 'classic' | 'crdt' = (
  (typeof process !== 'undefined' ? process.env?.LO_FIELD_STRATEGY : undefined) as any
) ?? 'classic';

const active = LO_FIELD_STRATEGY === 'crdt' ? crdt : classic;

export const stateField = active.stateField;
export const plainField = active.plainField;
export const docField = active.docField;
export const setField = active.setField;

// ---------------------------------------------------------------------------
// Always available regardless of strategy
// ---------------------------------------------------------------------------
export { fieldNameToDefaultEventName } from './shared';
export { immediate, debounce, throttle, aggregate, custom } from './batching';
export type { BatchingStrategy } from './batching';

// ---------------------------------------------------------------------------
// Future field type constructors (breadcrumbs)
// ---------------------------------------------------------------------------
//
// export { counterField } from './counterField';
//   Stores a G-Counter (or PN-Counter) CRDT. Materializes to number.
//   events: ['COUNTER_INCREMENT', 'COUNTER_DECREMENT']
//   Consumer API via useField: { value, increment(n?), decrement(n?) }
