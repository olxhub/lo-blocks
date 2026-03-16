// src/lib/state/index.ts
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

// ---------------------------------------------------------------------------
// Data structure hooks (loaded after redux to break circular dependency)
// ---------------------------------------------------------------------------
// These import from redux.ts, so they can't be in the fieldTypes barrel
// (fieldTypes → redux → fields → fieldTypes cycle). Listed here after
// redux.ts is fully loaded.
//
// Switch: classic/ (thin wrappers around useFieldState)
//         crdt/ (per-element events, CRDT-aware)
export { useSet } from './fieldTypes/classic/useSet';
// export { useSet } from './fieldTypes/crdt/set';
export { useDocField } from './fieldTypes/classic/useDocField';
// export { useDocField } from './fieldTypes/crdt/useDocField';

// ---------------------------------------------------------------------------
// UI bindings (wire data structures to DOM elements)
// ---------------------------------------------------------------------------
export * from './bindings';
