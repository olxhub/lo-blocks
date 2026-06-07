// packages/shared/lib/blocks/index.tsx
//
// Learning Observer block system - central exports for educational component framework.
//
// This is the main entry point for the block system, which provides the core
// abstraction for interactive learning components. Blocks combine React rendering
// with educational semantics like state management, grading, and content parsing.
//
// The system enables declarative authoring of learning experiences in OLX format,
// where complex educational interactions are built by composing simple, reusable
// blocks that automatically coordinate through actions and state sharing.
//
export { blocks } from './factory';
export { core, dev, test } from './namespaces';
export { getAllNodes, getDomNodeByStateKey, getKidsBFS, getKidsDFS, getParents, inferRelatedNodes, getGrader, getInputs, getValueById, extractChildText, propsFromNode } from './olxdom';
export { scopeMarker } from '../types/id-grammar';
export { action, executeNodeActions, grader, input, isAction, isInput, isMatch } from './actions';
export { correctness, correctnessPriority, visibilityHandlers, computeVisibility, isValidCorrectness, validateCorrectness, getAllCorrectnessStates, completion, completionPriority, isValidCompletion, validateCompletion, getAllCompletionStates } from './correctness';
export { worstCaseCorrectness, proportionalCorrectness, computeScore, formatScore, countCorrectness } from '@/lib/grading';
export { isInputReadOnly } from './inputInteraction';
export { baseAttributes, inputAttributes, graderAttributes, placeholder, src, z_stateRef, z_stateRefList, z_blockFieldRef, z_blockFieldRefList, z_expression } from './attributeSchemas';
export type { BlockFieldRef, RefExtractor } from './attributeSchemas';
export { useGraderAnswer, useGraderSummary, findGrader } from './useGraderAnswer';
export { createGrader } from './createGrader';
export { getBlockByOLXId, getBlocksByOLXIds } from './getBlockByOLXId';
