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
//   setField   — LWW-element set. See setField.ts.
//
// Future types: counterField (PN-Counter).
// To add a new type, see stateField.ts for the pattern.
//
export { stateField, stateField as plainField } from './stateField';
export { docField } from './docField';
export { setField } from './setField';
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
