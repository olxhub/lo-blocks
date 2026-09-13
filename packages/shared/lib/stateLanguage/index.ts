// packages/shared/lib/stateLanguage/index.ts
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
export { formatDuration } from '@/lib/util/duration';
export type { ContextData } from './evaluate';

// Function registry
export {
  dslFunctions,
  registerDSLFunction,
  getDSLFunction,
  hasDSLFunction,
  getDSLFunctionNames
} from './functions';

// Keywords
export { ACTIVE_METHODS, RESERVED_KEYWORDS, assertNotReserved } from './keywords';

// Member vocabulary (the table member access and method calls dispatch through)
export { readMember, callMember, isValueMethodName, ACTIVE_MEMBER_NAMES, ACTIVE_METHOD_NAMES, FORBIDDEN_PROPERTIES } from './methods';

// React hooks (require Redux)
export { useReferences, selectReferences, getReferences, useDSLExpression } from './hooks';
