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
export * from './commonFields';
export * from './settings';
export * from './redux';
export * from './store';
export * from './olxjson';

