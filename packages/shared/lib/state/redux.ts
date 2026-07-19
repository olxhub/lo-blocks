// packages/shared/lib/state/redux.ts
//
// Compatibility barrel for the state layer. The implementation lives in four
// modules split by concern and by the React boundary:
//
//   fieldReads.ts   — the three read levels, target/decl resolution, guards,
//                     non-hook getters (PURE; the levels table lives there).
//   fieldWrites.ts  — setField / updateField / dispatchFieldEvent (PURE).
//   blockValues.ts  — valueSelector + the loading/error status layer (PURE).
//   fieldHooks.ts   — 'use client': the useSelector-backed hooks.
//
// Headless callers (grading pipeline, server) import the PURE modules directly
// so they never pull a 'use client' file; client call sites keep importing
// from here (or '@/lib/state'), and this barrel re-exports everything.

'use client';

export * from './fieldReads';
export * from './fieldWrites';
export * from './blockValues';
export * from './fieldHooks';
export { blockData, withStatus, RETURNS_BLOCK_DATA } from './blockData';
