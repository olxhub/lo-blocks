// src/lib/blocks/useGraderAnswer.js
//
// Hook for inputs to access their grader's answer display state.
// Returns { showAnswer, displayAnswer } for rendering answer hints/highlights.
//
// Finds grader by (in priority order):
// 1. Grader with target pointing to this input (sibling graders - most specific)
// 2. Parent grader (input nested inside grader - includes metagraders)
//
'use client';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { getGrader, getAllNodes } from './olxdom';

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
 * Hook for input components to access grader's answer state.
 *
 * @param {object} props - Component props (with nodeInfo, idMap, componentMap)
 * @returns {{ showAnswer: boolean, displayAnswer: any, graderId: string|null }}
 *
 * Usage in input component:
 *   const { showAnswer, displayAnswer } = useGraderAnswer(props);
 *   if (showAnswer) {
 *     // Highlight correct answer, show hint, etc.
 *   }
 */
export function useGraderAnswer(props) {
  let graderId = null;
  let showAnswer = false;
  let displayAnswer = undefined;

  // Find grader: prefer targeting grader (more specific) over parent grader
  // This handles sibling patterns like <SortableInput/><SortableGrader target="..."/>
  graderId = findTargetingGrader(props);

  if (!graderId) {
    // No targeting grader - try parent grader
    try {
      graderId = getGrader(props);
    } catch (e) {
      // No grader found at all
      return { showAnswer: false, displayAnswer: undefined, graderId: null };
    }
  }

  // Subscribe to grader's showAnswer field
  try {
    const showAnswerField = state.componentFieldByName(props, graderId, 'showAnswer');
    showAnswer = useFieldSelector(
      props,
      showAnswerField,
      { id: graderId, fallback: false, selector: s => s?.showAnswer ?? false }
    );
  } catch (e) {
    showAnswer = false;
  }

  // Get displayAnswer from grader's blueprint
  if (showAnswer && graderId) {
    const graderInstance = props.idMap?.[graderId];
    const graderBlueprint = graderInstance ? props.componentMap?.[graderInstance.tag] : null;

    if (graderBlueprint?.getDisplayAnswer) {
      // Build grader props for getDisplayAnswer call
      // Include kids from grader instance so getDisplayAnswer can inspect children
      const graderProps = {
        ...props,
        id: graderId,
        kids: graderInstance?.kids,
        ...graderInstance?.attributes,
      };
      displayAnswer = graderBlueprint.getDisplayAnswer(graderProps);
    }
  }

  return { showAnswer, displayAnswer, graderId };
}
