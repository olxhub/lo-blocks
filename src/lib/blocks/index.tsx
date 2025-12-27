// src/lib/blocks/index.tsx
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
export { getAllNodes, getKidsBFS, getKidsDFS, getParents, inferRelatedNodes, getGrader, getInputs, getValueById, extractChildText } from './olxdom';
export { displayName, htmlId, idMapKey, nodeId, reactKey, reduxId, urlName } from './idResolver';
export { action, executeNodeActions, grader, input, isAction, isInput, isMatch } from './actions';
export { CORRECTNESS, CORRECTNESS_PRIORITY, VISIBILITY_HANDLERS, computeVisibility, isValidCorrectness, validateCorrectness, getAllCorrectnessStates } from './correctness';

// Re-import for use in getBlockByOLXId
import { idMapKey } from './idResolver';
import type { PropType, OlxJson } from '@/lib/types';

/**
 * Get a block from the idMap by its OLX ID.
 *
 * This is the single abstraction point for block lookup. All components should
 * use this function rather than accessing props.idMap directly. This enables
 * future enhancements like ID normalization, server fetching, and store hierarchies.
 *
 * @param props - Component props containing idMap
 * @param id - The OLX ID to look up (can be absolute or relative)
 * @returns The block entry, or undefined if not found
 */
export async function getBlockByOLXId(props: PropType, id: string): Promise<OlxJson | undefined> {
  return props.idMap[idMapKey(id)];
}
export { worstCaseCorrectness, proportionalCorrectness, computeScore, formatScore, countCorrectness } from '@/lib/grading';
export { isInputReadOnly } from './inputInteraction';
export { baseAttributes, BASE_ATTRIBUTE_NAMES } from './attributeSchemas';
export { useGraderAnswer } from './useGraderAnswer';
export { createGrader } from './createGrader';
