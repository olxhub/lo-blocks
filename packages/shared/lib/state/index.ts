// packages/shared/lib/state/index.ts
//
// Learning Observer state management - unified exports for Redux-based state system.
//
// Provides a complete state management solution tailored for educational technology:
// - Scoped state organization (component/system/storage levels)
// - Declarative field definitions with automatic event generation
// - Analytics-first design with comprehensive logging to lo_event
// - React integration hooks for seamless component development
//
// Key design principle: State can be reconstructed from events by design.
// All state changes flow through lo_event logging, enabling replay, debugging,
// and learning analytics while maintaining Redux for real-time UI updates.
//
// A major goal is to make redux simple.
export * from './scopes';
export * from './fields';
export * from './fieldTypes';
export * from './commonFields';
export * from './settings';
export * from './blockData';
export * from './redux';
export * from './store';
export * from './olxjson';
export * from './urlFields';
export { useLoaded, useSaved, useConnected } from 'lo_event/hooks';

// ---------------------------------------------------------------------------
// Data structure hooks (loaded after redux to break circular dependency)
// ---------------------------------------------------------------------------
// These import from redux.ts, so they can't be in the fieldTypes barrel
// (fieldTypes → redux → fields → fieldTypes cycle). Listed here after
// redux.ts is fully loaded.
//
// Reads LO_FIELD_STRATEGY from fieldTypes/index.ts — same env var that
// controls the constructors, so one toggle switches everything.
import { LO_FIELD_STRATEGY } from './fieldTypes';
import { useSet as classicUseSet } from './fieldTypes/classic/useSet';
import { useSet as crdtUseSet } from './fieldTypes/crdt/set';
import { useDocField as classicUseDocField } from './fieldTypes/classic/useDocField';
import { useNextId as classicUseNextId } from './fieldTypes/classic/useNextId';

export const useSet = LO_FIELD_STRATEGY === 'crdt' ? crdtUseSet : classicUseSet;
export const useDocField = classicUseDocField; // CRDT useDocField not yet implemented
export const useNextId = classicUseNextId;

// Log field dispatch helpers (append-only ordered log; strategy-independent).
// Re-exported here, not from the fieldTypes barrel, for the same cycle
// reason as useSet: they import redux.ts.
export { appendToLog, clearLog } from './fieldTypes/crdt/log';

// ---------------------------------------------------------------------------
// UI bindings (wire data structures to DOM elements)
// ---------------------------------------------------------------------------
export * from './bindings';
