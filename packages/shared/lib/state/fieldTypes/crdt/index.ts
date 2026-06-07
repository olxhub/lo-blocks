// packages/shared/lib/state/fieldTypes/crdt/index.ts
//
// CRDT field types — LWW/RGA conflict resolution, delta encoding, field-level reducers.
//
// Available field types:
//   stateField — LWW register. The default. See state.ts.
//   docField   — RGA CRDT for collaborative text. See doc.ts.
//   setField   — LWW-element set. See setConstructor.ts.
//
// NOTE: useSet is NOT re-exported here — it imports from redux.ts which
// would create a circular dependency through the barrel. It's re-exported
// from state/index.ts after the fieldTypes/redux/fields cycle resolves.
//
export { stateField, stateField as plainField } from './state';
export { docField } from './doc';
export { setField } from './setConstructor';
export { idField } from './id';
