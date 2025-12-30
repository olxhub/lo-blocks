// src/lib/blocks/useGraderAnswer.js
//
// Hook for inputs to access their grader's answer display state.
// Returns { showAnswer, displayAnswer, graderId } for rendering answer hints/highlights.
//
// Inputs can be used both inside graders and standalone. When no grader exists,
// returns { showAnswer: false, displayAnswer: undefined, graderId: null }.
//
// Finds grader by (in priority order):
// 1. Grader with target pointing to this input (sibling graders - most specific)
// 2. Parent grader (input nested inside grader - includes metagraders)
//
'use client';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { getGrader, getAllNodes } from './olxdom';
import { useBlockByOLXId } from './useBlockByOLXId';

/**
 * Find a grader that targets this input (for sibling grader patterns).
 * Searches the dynamic OLX DOM (rendered tree), not the static idMap.
 *
 * Note: OLX DOM is a DAG - nodes can be reached multiple ways. getAllNodes
 * may return duplicates, but we return on first match so this is benign.
 * If performance becomes an issue, add a visited set.
 */
function findTargetingGrader(props) {
  const { id, nodeInfo } = props;
  if (!nodeInfo) return null;

  const graderNodes = getAllNodes(nodeInfo, {
    selector: (n) => n.blueprint?.isGrader && n.node?.attributes?.target
  });

  for (const graderNodeInfo of graderNodes) {
    const targets = graderNodeInfo.node.attributes.target.split(',').map(t => t.trim());
    if (targets.includes(id)) {
      return graderNodeInfo.node.id;
    }
  }
  return null;
}

/**
 * Find the grader for this input, or null if none exists.
 * Does not throw - inputs can legitimately exist without graders.
 */
function findGrader(props) {
  // First try targeting grader (sibling pattern)
  const targetingGrader = findTargetingGrader(props);
  if (targetingGrader) return targetingGrader;

  // Then try parent grader
  try {
    return getGrader(props);
  } catch {
    return null;
  }
}

/**
 * Hook for input components to access grader's answer state.
 *
 * @param {object} props - Component props (with nodeInfo, idMap, componentMap, fields)
 * @returns {{ showAnswer: boolean, displayAnswer: any, graderId: string|null }}
 *
 * Usage in input component:
 *   const { showAnswer, displayAnswer } = useGraderAnswer(props);
 *   if (showAnswer) {
 *     // Highlight correct answer, show hint, etc.
 *   }
 */
export function useGraderAnswer(props) {
  // Find grader (may be null for standalone inputs)
  const graderId = findGrader(props);

  // Get showAnswer field from grader, or null if no grader
  const showAnswerField = graderId
    ? state.componentFieldByName(props, graderId, 'showAnswer')
    : null;

  // Subscribe to field (hook must always be called, but selector handles null field)
  // When no grader exists and component has no fields, create a dummy field for hook compliance
  const fallbackField = props.fields?.value ?? { scope: 'component', name: 'showAnswer' };
  const showAnswer = useFieldSelector(
    props,
    showAnswerField || fallbackField,
    {
      id: graderId || props.id,
      fallback: false,
      // When no grader, selector always returns false
      selector: showAnswerField ? (s => s?.showAnswer ?? false) : (() => false)
    }
  );

  // Get grader instance unconditionally (hook must always be called)
  const graderInstance = useBlockByOLXId(props, graderId || '');

  // Get displayAnswer from grader's blueprint when showAnswer is true
  let displayAnswer = undefined;
  if (showAnswer && graderId && graderInstance) {
    const graderBlueprint = props.componentMap[graderInstance.tag];

    if (graderBlueprint.getDisplayAnswer) {
      const graderProps = {
        ...props,
        id: graderId,
        kids: graderInstance.kids,
        ...graderInstance.attributes,
      };
      displayAnswer = graderBlueprint.getDisplayAnswer(graderProps);
    }
  }

  return { showAnswer, displayAnswer, graderId };
}
