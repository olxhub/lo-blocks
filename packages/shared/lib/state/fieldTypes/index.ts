// lib/state/fieldTypes/index.ts
//
// Switch between classic (main-branch) and CRDT field implementations.
//
// Classic: values stored bare, spread-based reducer, no timestamps.
//   Only stateField — docField and setField don't exist on main.
//
// CRDT: LWW/RGA conflict resolution, delta encoding, field-level reducers.
//   stateField (LWW), docField (RGA), setField (LWW-element set).
//
// Default: classic (battle-tested production behavior from main).
// To enable CRDTs: change to `export * from './crdt'`
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

// ---------------------------------------------------------------------------
// Active field type strategy (change this one line to switch)
// ---------------------------------------------------------------------------
export * from './classic';
// export * from './crdt';

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
