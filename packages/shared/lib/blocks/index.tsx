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
export { getAllNodes, getDomNodeByStateKey, getKidsBFS, getKidsDFS, getParents, inferRelatedNodes, getGrader, getValueById, extractChildText, propsFromNode } from './dynamicDom';
export { scopeMarker } from '../types/id-grammar';
export { action, executeNodeActions, input, isAction, isInput, isMatch } from './actions';
// grader() lives with the rest of the grading subsystem
export { grader } from '@/lib/grading/submitGrade';
export { correctness, correctnessPriority, visibilityHandlers, computeVisibility, isValidCorrectness, validateCorrectness, getAllCorrectnessStates, completion, completionPriority, isValidCompletion, validateCompletion, getAllCompletionStates } from '../grading/correctness';
export { baseAttributes, inputAttributes, graderAttributes, placeholder, src, templateAttribute, textTemplateModes, z_stateRef, z_stateRefList, z_blockFieldRef, z_blockFieldRefList, z_expression } from './attributeSchemas';
export type { BlockFieldRef, RefExtractor, TextTemplateMode } from './attributeSchemas';
export { createGrader } from './createGrader';
export { getBlockByDefinitionRef, getBlocksByDefinitionRefs } from './getBlockByDefinitionRef';
