// src/lib/stateLanguage/index.ts
//
// Public API for the state language module.
//
// Core layer (no React/Redux dependencies):
// - parse, tryParse, parseResult
// - extractReferences, extractStructuredRefs, mergeReferences
// - evaluate, createContext
//
// React integration layer (requires Redux):
// - useReferences, selectReferences, getReferences

// Parser
export { parse, tryParse, parseResult } from './parser';
export type { ASTNode, SigilRef } from './parser';

// References
export {
  extractReferences,
  extractStructuredRefs,
  mergeReferences,
  extractAndMergeRefs,
  extractComponentIds,
  extractContentIds,
  extractGlobalVars,
  toStructuredRefs,
  extractInterpolations,
  extractInterpolationRefs,
  EMPTY_REFS
} from './references';
export type { Reference, References, Interpolation } from './references';

// Evaluation
export { evaluate, createContext, wordcount } from './evaluate';
export type { ContextData } from './evaluate';

// Function registry
export {
  dslFunctions,
  registerDSLFunction,
  getDSLFunction,
  hasDSLFunction,
  getDSLFunctionNames
} from './functions';

// React hooks (require Redux)
export { useReferences, selectReferences, getReferences } from './hooks';
