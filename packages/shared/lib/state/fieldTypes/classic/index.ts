// lib/state/fieldTypes/classic/index.ts
//
// Classic field types — the pre-CRDT behavior from main.
//
// All field constructors produce bare-value fields: no timestamps, no
// conflict resolution. docField and setField are thin wrappers around
// stateField so that blocks can use them without import path changes.
//
// NOTE: useSet is NOT re-exported here — it imports from redux.ts which
// would create a circular dependency through the barrel. It's re-exported
// from state/index.ts after the fieldTypes/redux/fields cycle resolves.
//
export { stateField, stateField as plainField } from './state';
export { docField } from './doc';
export { setField } from './set';
