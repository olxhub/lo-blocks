// packages/shared/lib/player/useGraderAnswer.ts
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
import { getGrader, getDomNodeByStateKey, getAllNodes, inferRelatedNodes } from '../blocks/dynamicDom';
import { useOlxJson } from './client/useOlxJson';
import { parseAnyStateRef, stateKeyForGlobalRef, leafDefinitionKeyFromStateKey, qualifyDefinitionRef, scopedStateKeyForBlock } from '../types/id-grammar';
import { getBlockByDefinitionRef } from '../blocks/getBlockByDefinitionRef';
import { staticTargetProps } from '../state/blockData';
import { isInput } from '../blocks/actions';
import type { DefinitionKey, DefinitionRef, StateKey, RuntimeProps } from '@/lib/types';

/**
 * Find a grader that targets this input (for sibling grader patterns).
 * Searches the dynamic OLX DOM (rendered tree), not the static idMap.
 *
 * Note: OLX DOM is a DAG - nodes can be reached multiple ways. getAllNodes
 * may return duplicates, but we return on first match so this is benign.
 * If performance becomes an issue, add a visited set.
 */
function findTargetingGrader(props: RuntimeProps): StateKey | null {
  const { id, nodeInfo } = props;
  if (!nodeInfo) return null;

  const graderNodes = getAllNodes(nodeInfo, {
    selector: (n) => !!n.loBlock.isGrader && !!n.olxJson.attributes.target
  });

  const ns = props.runtime.ns;
  const normalizedId = qualifyDefinitionRef(id, ns);

  for (const graderNodeInfo of graderNodes) {
    const targetAttr = graderNodeInfo.olxJson.attributes.target;
    if (!targetAttr) continue;

    // Zod-validated targets are StateRef[]. Retain string handling for legacy
    // or parser-generated entries that did not pass through the block schema.
    const targetStrings: string[] = Array.isArray(targetAttr)
      ? targetAttr.map(String)
      : typeof targetAttr === 'string'
        ? targetAttr.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    const targets = targetStrings.map(t => {
      const stateKey = stateKeyForGlobalRef(parseAnyStateRef(t), ns);
      return leafDefinitionKeyFromStateKey(stateKey);
    });
    if (targets.includes(normalizedId)) {
      return graderNodeInfo.stateKey;
    }
  }
  return null;
}

/**
 * Find the grader for this input, or null if none exists.
 * Does not throw - inputs can legitimately exist without graders.
 * Exported for conditional rendering (e.g., only render DisplayAnswer if grader exists).
 */
export function findGrader(props: RuntimeProps): StateKey | null {
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
  graderId: StateKey,
  graderBlueprint: any,
  graderInstance: any
): string | undefined {
  const slots = graderBlueprint.slots;
  if (!slots || slots.length === 0) return undefined;

  const inputId = props.id;

  // Check for explicit slot= attribute on this input
  const inputInstance = getBlockByDefinitionRef(props, inputId);
  if (inputInstance?.attributes?.slot) {
    return inputInstance.attributes.slot as string;
  }

  // Find all inputs for this grader and determine position
  // Find inputs by traversing from grader
  // This mirrors the logic in actions.tsx
  const targetAttr = graderInstance.attributes?.target;

  // Get input IDs (same inference logic as grader action)
  let inputIds: StateKey[] = [];
  try {
    // graderId is already a StateKey — look up the OlxDomNode directly
    const graderNodeInfo = getDomNodeByStateKey(props, graderId);
    if (!graderNodeInfo) return undefined;

    // Create props with grader's nodeInfo for proper traversal
    const graderDefKey = leafDefinitionKeyFromStateKey(graderId);
    const graderProps = { ...props, id: graderDefKey, nodeInfo: graderNodeInfo };
    inputIds = inferRelatedNodes(graderProps, {
      selector: n => n.loBlock && isInput(n.loBlock),
      infer: true,
      targets: targetAttr,
    });
  } catch {
    return undefined;
  }

  // Find position of this input in the list
  const normalizedId = qualifyDefinitionRef(inputId, props.runtime.ns);
  const position = inputIds.findIndex(id => leafDefinitionKeyFromStateKey(id) === normalizedId);

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
    ? state.componentFieldByStateKey(props, graderId, 'showAnswer')
    : null;

  // The hook must always run; read commonFields.showAnswer on the own scoped
  // key when there is no grader (a harmless read kept for hook stability), then
  // gate to false. graderId is already a StateKey.
  const graderStateKey = graderId || scopedStateKeyForBlock(props);
  const rawShowAnswer = useFieldSelector<boolean>(
    props,
    showAnswerField ?? state.commonFields.showAnswer,
    { stateKey: graderStateKey ?? undefined, fallback: false },
  );
  const showAnswer = showAnswerField ? rawShowAnswer : false;

  // Get grader instance unconditionally (hook must always be called).
  // Convert StateKey to DefinitionKey for useOlxJson lookup.
  const graderDefKeyForLookup = graderId ? leafDefinitionKeyFromStateKey(graderId) : null;
  const { olxJson: graderInstance } = useOlxJson(props, graderDefKeyForLookup);

  // Get displayAnswer from grader's blueprint when showAnswer is true
  let displayAnswer: any = undefined;
  let slot: string | undefined = undefined;

  if (showAnswer && graderId && graderInstance) {
    const graderBlueprint = props.runtime.blockRegistry[graderInstance.tag];
    const displayMode = graderBlueprint.answerDisplayMode ?? 'per-input';

    // Only show per-input answer in 'per-input' mode
    if (displayMode === 'per-input') {
      // The GRADER's own props — built from its static entry, never by
      // spreading this component's props (a choice item's attributes must
      // not leak under the grader's).
      const graderDefKey = leafDefinitionKeyFromStateKey(graderId);
      const graderProps = staticTargetProps(
        props.runtime, graderId, graderDefKey, graderInstance, graderBlueprint,
      );

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
export function useGraderSummary(props: RuntimeProps, graderId: StateKey | null) {
  // Get showAnswer field from grader
  const showAnswerField = graderId
    ? state.componentFieldByStateKey(props, graderId, 'showAnswer')
    : null;

  // graderId is already a StateKey; fall back to own scoped key for hook
  // stability, then gate to false when there is no grader.
  const summaryGraderStateKey = graderId || scopedStateKeyForBlock(props);
  const rawShowAnswer = useFieldSelector<boolean>(
    props,
    showAnswerField ?? state.commonFields.showAnswer,
    { stateKey: summaryGraderStateKey ?? undefined, fallback: false },
  );
  const showAnswer = showAnswerField ? rawShowAnswer : false;

  const summaryGraderDefKey = graderId ? leafDefinitionKeyFromStateKey(graderId) : null;
  const { olxJson: graderInstance } = useOlxJson(props, summaryGraderDefKey);

  let summaryAnswer = undefined;

  if (showAnswer && graderId && graderInstance) {
    const graderBlueprint = props.runtime.blockRegistry[graderInstance.tag];
    const displayMode = graderBlueprint.answerDisplayMode ?? 'per-input';

    // Only return summary for 'summary' mode
    if (displayMode === 'summary' && graderBlueprint.getDisplayAnswer) {
      // TODO: graderProps should include complete runtime context and blueprint fields
      const graderDefKey = leafDefinitionKeyFromStateKey(graderId);
      const graderProps = {
        ...props,
        id: graderDefKey,
        kids: graderInstance.kids,
        ...graderInstance.attributes,
      };
      summaryAnswer = graderBlueprint.getDisplayAnswer(graderProps);
    }
  }

  return { showAnswer, summaryAnswer };
}
