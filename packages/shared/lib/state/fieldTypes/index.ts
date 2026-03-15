// lib/state/fieldTypes/index.ts
//
// Field type constructors — create FieldInfo objects with type-specific behavior.
//
// Every field is a complete behavioral bundle: read, write, reduce, display,
// equality, events. Block authors write the minimal form:
//   fields: [docField('value'), 'readonly']
// and the constructors fill in all behaviors. Bare strings like 'readonly'
// produce state fields (LWW register) automatically via stateField().
//
// Available field types:
//   stateField — LWW register. The default. See stateField.ts.
//   docField   — RGA CRDT for collaborative text. See docField.ts.
//
// Future types: setField (OR-Set), counterField (PN-Counter).
// To add a new type, see stateField.ts for the pattern.
//
export { stateField, stateField as plainField } from './stateField';
export { docField } from './docField';
export { fieldNameToDefaultEventName } from './shared';
export { immediate, debounce, throttle, aggregate, custom } from './batching';
export type { BatchingStrategy } from './batching';

// ---------------------------------------------------------------------------
// Future field type constructors (breadcrumbs)
// ---------------------------------------------------------------------------
//
// export { setField } from './setField';
//   Stores an OR-Set CRDT. Materializes to Set<T>.
//   events: ['SET_ADD', 'SET_REMOVE']
//   Consumer API via useField: { add(item), remove(item), has(item), values }
//
// export { counterField } from './counterField';
//   Stores a G-Counter (or PN-Counter) CRDT. Materializes to number.
//   events: ['COUNTER_INCREMENT', 'COUNTER_DECREMENT']
//   Consumer API via useField: { value, increment(n?), decrement(n?) }
//
// Design notes:
//
// Each constructor produces a complete FieldInfo with sensible defaults.
// Block authors write the minimal form and the field system fills in everything.
// The blueprint normalization layer (in blocks.ts) can also expand bare strings
// like 'value' into stateField('value'), keeping the authoring surface minimal.
