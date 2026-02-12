// src/lib/blocks/useGraderAnswer.ts
//
// Hook for inputs to access their grader's answer display state.
// Returns { showAnswer, displayAnswer, graderId, slot } for rendering answer hints/highlights.
//
// Inputs can be used both inside graders and standalone. When no grader exists,
// returns { showAnswer: false, displayAnswer: undefined, graderId: null, slot: undefined }.
//
// Finds grader by (in priority order):
// 1. Grader with target pointing to this input (sibling graders - most specific)
// 2. Parent grader (input nested inside grader - includes metagraders)
//
// Answer display is controlled by the grader's answerDisplayMode:
// - 'per-input': Show answer next to each input (default)
// - 'summary': Show answer once after all inputs (inputs get undefined)
// - 'custom': Grader handles display (MCQ highlights, etc.)
// - 'none': No answer to show
//
'use client';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { getGrader, getAllNodes, inferRelatedNodes } from './olxdom';
import { useOlxJson } from './useOlxJson';
import { refToOlxKey, toOlxReference } from './idResolver';
import { getBlockByOLXId } from './getBlockByOLXId';
import { isInput } from './actions';
import type { OlxKey, OlxReference, RuntimeProps } from '@/lib/types';

/**
 * Find a grader that targets this input (for sibling grader patterns).
 * Searches the dynamic OLX DOM (rendered tree), not the static idMap.
 *
 * Note: OLX DOM is a DAG - nodes can be reached multiple ways. getAllNodes
 * may return duplicates, but we return on first match so this is benign.
 * If performance becomes an issue, add a visited set.
 */
function findTargetingGrader(props: RuntimeProps): OlxKey | null {
  const { id, nodeInfo } = props;
  if (!nodeInfo) return null;

  const graderNodes = getAllNodes(nodeInfo, {
    selector: (n) => !!n.loBlock.isGrader && !!n.olxJson.attributes.target
  });

  const normalizedId = refToOlxKey(id);

  for (const graderNodeInfo of graderNodes) {
    // target is a comma-separated list of OlxRefs (guaranteed by selector filter)
    const targetList = graderNodeInfo.olxJson.attributes.target;
    if (typeof targetList !== 'string') continue;  // Type guard for TypeScript
    const targets = targetList.split(',').map(t => refToOlxKey(toOlxReference(t.trim())));
    if (targets.includes(normalizedId)) {
      return graderNodeInfo.olxJson.id;
    }
  }
  return null;
}

/**
 * Find the grader for this input, or null if none exists.
 * Does not throw - inputs can legitimately exist without graders.
 * Exported for conditional rendering (e.g., only render DisplayAnswer if grader exists).
 */
export function findGrader(props: RuntimeProps): OlxKey | null {
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
 * Determine this input's slot within the grader.
 * Returns the slot name if grader uses named slots, undefined otherwise.
 */
function resolveInputSlot(
  props: RuntimeProps,
  graderId: OlxKey,
  graderBlueprint: any,
  graderInstance: any
): string | undefined {
  const slots = graderBlueprint.slots;
  if (!slots || slots.length === 0) return undefined;

  const inputId = props.id;

  // Check for explicit slot= attribute on this input
  const inputInstance = getBlockByOLXId(props, inputId);
  if (inputInstance?.attributes?.slot) {
    return inputInstance.attributes.slot as string;
  }

  // Find all inputs for this grader and determine position
  // Find inputs by traversing from grader
  // This mirrors the logic in actions.tsx
  const targetAttr = graderInstance.attributes?.target;

  // Get input IDs (same inference logic as grader action)
  let inputIds: OlxKey[] = [];
  try {
    // Find the grader's actual nodeInfo by traversing from root
    // We can't just swap id - inferRelatedNodes uses nodeInfo for traversal
    const graderNodeInfo = getAllNodes(props.nodeInfo, {
      selector: n => n.olxJson?.id === graderId
    })[0];

    if (!graderNodeInfo) return undefined;

    // Create props with grader's nodeInfo for proper traversal
    const graderProps = { ...props, id: graderId, nodeInfo: graderNodeInfo };
    inputIds = inferRelatedNodes(graderProps, {
      selector: n => n.loBlock && isInput(n.loBlock),
      infer: true,
      targets: targetAttr,
    });
  } catch {
    return undefined;
  }

  // Find position of this input in the list
  const normalizedId = refToOlxKey(inputId);
  const position = inputIds.findIndex(id => refToOlxKey(id) === normalizedId);

  if (position >= 0 && position < slots.length) {
    return slots[position];
  }

  return undefined;
}

/**
 * Hook for input components to access grader's answer state.
 *
 * @param {object} props - Component props (with nodeInfo, blockRegistry, fields)
 * @returns {{ showAnswer: boolean, displayAnswer: any, graderId: string|null, slot: string|undefined }}
 *
 * Usage in input component:
 *   const { showAnswer, displayAnswer } = useGraderAnswer(props);
 *   if (showAnswer && displayAnswer) {
 *     // Highlight correct answer, show hint, etc.
 *   }
 */
export function useGraderAnswer(props: RuntimeProps) {
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

  // Get grader instance unconditionally (hook must always be called).
  // Pass graderId directly - useOlxJson handles null gracefully.
  const { olxJson: graderInstance } = useOlxJson(props, graderId);

  // Get displayAnswer from grader's blueprint when showAnswer is true
  let displayAnswer = undefined;
  let slot: string | undefined = undefined;

  if (showAnswer && graderId && graderInstance) {
    const graderBlueprint = props.runtime.blockRegistry[graderInstance.tag];
    const displayMode = graderBlueprint.answerDisplayMode ?? 'per-input';

    // Only show per-input answer in 'per-input' mode
    if (displayMode === 'per-input') {
      // TODO: graderProps should include complete runtime context and blueprint fields
      const graderProps = {
        ...props,
        id: graderId,
        kids: graderInstance.kids,
        ...graderInstance.attributes,
      };

      // Check for slot-based display answers
      if (graderBlueprint.getDisplayAnswers && graderBlueprint.slots) {
        slot = resolveInputSlot(props, graderId, graderBlueprint, graderInstance);
        if (slot) {
          const answers = graderBlueprint.getDisplayAnswers(graderProps);
          // Only show if this slot has an answer; undefined means "no answer for this slot"
          displayAnswer = answers?.[slot];
        }
        // Don't fall back to getDisplayAnswer when using slot-based answers
      } else if (graderBlueprint.getDisplayAnswer) {
        // Single display answer (no slots)
        displayAnswer = graderBlueprint.getDisplayAnswer(graderProps);
      }
    }
    // For 'summary', 'custom', 'none': displayAnswer stays undefined
    // The summary is shown elsewhere (by a SummaryAnswer component or grader itself)
  }

  return { showAnswer, displayAnswer, graderId, slot };
}

/**
 * Hook for getting a grader's summary answer (for 'summary' display mode).
 * Use this in components that display the answer after all inputs.
 *
 * @param {object} props - Component props
 * @param {string} graderId - The grader's ID
 * @returns {{ showAnswer: boolean, summaryAnswer: any }}
 */
export function useGraderSummary(props: RuntimeProps, graderId: OlxKey | null) {
  // Get showAnswer field from grader
  const showAnswerField = graderId
    ? state.componentFieldByName(props, graderId, 'showAnswer')
    : null;

  const fallbackField = props.fields?.value ?? { scope: 'component', name: 'showAnswer' };
  const showAnswer = useFieldSelector(
    props,
    showAnswerField || fallbackField,
    {
      id: graderId || props.id,
      fallback: false,
      selector: showAnswerField ? (s => s?.showAnswer ?? false) : (() => false)
    }
  );

  const { olxJson: graderInstance } = useOlxJson(props, graderId);

  let summaryAnswer = undefined;

  if (showAnswer && graderId && graderInstance) {
    const graderBlueprint = props.runtime.blockRegistry[graderInstance.tag];
    const displayMode = graderBlueprint.answerDisplayMode ?? 'per-input';

    // Only return summary for 'summary' mode
    if (displayMode === 'summary' && graderBlueprint.getDisplayAnswer) {
      // TODO: graderProps should include complete runtime context and blueprint fields
      const graderProps = {
        ...props,
        id: graderId,
        kids: graderInstance.kids,
        ...graderInstance.attributes,
      };
      summaryAnswer = graderBlueprint.getDisplayAnswer(graderProps);
    }
  }

  return { showAnswer, summaryAnswer };
}
