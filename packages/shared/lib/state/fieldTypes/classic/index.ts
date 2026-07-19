// packages/shared/lib/state/fieldTypes/classic/index.ts
//
// Classic field types — the pre-CRDT behavior from main.
//
// All field constructors produce bare-value fields: no timestamps, no
// conflict resolution. docField and orSetField are thin wrappers around
// stateField so that blocks can use them without import path changes.
//
// NOTE: useSet is NOT re-exported here — it imports from redux.ts which
// would create a circular dependency through the barrel. It's re-exported
// from state/index.ts after the fieldTypes/redux/fields cycle resolves.
//
// docField and orSetField are behaviorless aliases of stateField in classic
// mode (bare-value storage, no CRDT). The CRDT barrel supplies the real
// implementations; here they're the same LWW-free stateField.
export { stateField, stateField as plainField, stateField as docField, stateField as orSetField } from './state';
export { idField } from './id';
