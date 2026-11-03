// packages/shared/lib/player/useEnclosingProblem.ts
//
// The enclosing problem's answer-visibility and input-locking policy, as an
// input sees it.
//
// Two facts about a problem decide how its inputs behave, and no input holds
// either one: the authored policy (showAnswer, answerReveal, lockInput,
// maxAttempts) and the live submission state (submitCount, correctness) the
// conditions are evaluated against. This hook pairs them, so
// useGraderAnswer and useInputReadOnly can DERIVE the reveal and the lock on
// every render instead of storing a copy of them per input. Derived means a
// <Use ref=...> revisit, a second mounted copy, and a page reload all show the
// same thing: nothing was written that could disagree.
//
// The enclosing problem is the nearest METAGRADER ancestor in the rendered
// tree — a grader block with no grading descriptor of its own (CapaProblem,
// MarkupProblem), which is the same test selectGradingState uses to pick its
// aggregate strategy. Nearest wins, so an input inside a nested problem
// answers to that problem, not the outer one.
//
// An input outside any problem gets null and keeps its standalone behaviour.
//
'use client';
import { getParents } from '../blocks/dynamicDom';
import { useGradingState } from '../grading';
import { parseMaxAttempts, type ProblemState } from '../grading/problemModes';
import { scopedStateKeyForBlock } from '../types/id-grammar';
import type { AnswerRevealMode, ProblemCondition } from '../blocks/attributeSchemas';
import type { OlxDomNode, RuntimeProps } from '@/lib/types';

// Each attribute is passed on exactly as authored — undefined and all — so the
// problemModes decision functions apply their own defaults in one place.
export interface EnclosingProblem {
  /** When the answer becomes available. */
  showAnswer: ProblemCondition | undefined;
  /** Whether an available answer arrives by button or on its own. */
  answerReveal: AnswerRevealMode | undefined;
  /** When inputs stop accepting changes. */
  lockInput: ProblemCondition | undefined;
  /** Attempts and correctness, the state the conditions are evaluated against. */
  state: ProblemState;
}

/** A grader block that aggregates children rather than grading itself. */
function isProblemNode(node: OlxDomNode): boolean {
  return node.loBlock.isGrader && !node.loBlock.grading;
}

export function useEnclosingProblem(props: RuntimeProps): EnclosingProblem | null {
  const [problemNode] = getParents(props.nodeInfo, { selector: isProblemNode });

  // The hook must run on every render, so read the own scoped key when there
  // is no problem (a leaf read of an ungraded block — harmless) and gate the
  // result to null below.
  const problemStateKey = problemNode ? problemNode.stateKey : scopedStateKeyForBlock(props);
  const grading = useGradingState(props, problemStateKey);

  if (!problemNode) return null;

  const attributes = problemNode.olxJson.attributes;
  return {
    showAnswer: attributes.showAnswer as ProblemCondition | undefined,
    answerReveal: attributes.answerReveal as AnswerRevealMode | undefined,
    lockInput: attributes.lockInput as ProblemCondition | undefined,
    state: {
      submitCount: grading.submitCount,
      maxAttempts: parseMaxAttempts(attributes.maxAttempts as string | undefined),
      correct: grading.correct,
    },
  };
}
