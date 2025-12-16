// src/lib/blocks/useGraderAnswer.js
//
// Hook for inputs to access their parent grader's answer display state.
// Returns { showAnswer, displayAnswer } for rendering answer hints/highlights.
//
'use client';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { getGrader } from './olxdom';

/**
 * Hook for input components to access parent grader's answer state.
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

  try {
    graderId = getGrader(props);
  } catch (e) {
    // No grader found - return defaults
    return { showAnswer: false, displayAnswer: undefined, graderId: null };
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
      const graderProps = {
        ...props,
        id: graderId,
        ...graderInstance?.attributes,
      };
      displayAnswer = graderBlueprint.getDisplayAnswer(graderProps);
    }
  }

  return { showAnswer, displayAnswer, graderId };
}
