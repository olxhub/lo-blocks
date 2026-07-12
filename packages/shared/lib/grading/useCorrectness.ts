// packages/shared/lib/grading/useCorrectness.ts
//
// The single read point for a grader's grading state.
//
// Principle: STORE FACTS AT THE LEAVES, DERIVE EVERYTHING ABOVE.
//
// - Leaf graders (blocks composed with the grader() action mixin) own stored
//   grading state: the grading action writes correct/message/score/
//   submitCount per-field (lib/blocks/actions.tsx). That covers the submit
//   path and the async/slow path — a slow grader writes correct='submitted'
//   when grading starts and the final result when it lands.
// - Metagraders (CapaProblem, MarkupProblem — isGrader without an action)
//   never store aggregates. Their grading state is DERIVED here by
//   recursively aggregating their child graders, so there is no mirror
//   state to keep in sync, no replay problem, and orchestrators (e.g.
//   MasteryBank) observe child grading without any submit round-trip.
//
// PLANNED: derived leaf correctness. For immediate-mode sync graders,
// correctness becomes a pure function of the live input values (evaluate
// over input.value) instead of stored state. That branch lands in
// selectGradingState, keyed off the grader blueprint, so consumers never
// know which world they're in.
//
'use client';
import { useSelector, shallowEqual } from 'react-redux';
import { correctness } from '../blocks/correctness';
import { getDomNodeByStateKey, inferRelatedNodes } from '../blocks/olxdom';
import { worstCaseCorrectness } from './aggregators';
import { commonFields } from '../state/commonFields';
import { fieldSelector } from '../state/redux';
import type { RuntimeProps, StateKey } from '../types';

export interface GraderGradingState {
  /** A `correctness` enum value ('correct', 'submitted', 'unsubmitted', …). */
  correct: string;
  message: string;
  score: number | undefined;
  submitCount: number;
}

const UNGRADED: GraderGradingState = {
  correct: correctness.unsubmitted,
  message: '',
  score: undefined,
  submitCount: 0,
};

/**
 * Plain (non-hook) selector for a grader's grading state. Usable from
 * actions, orchestrators, and server code as well as React (via
 * useCorrectness).
 *
 * Metagraders are detected structurally: isGrader with no grading action.
 * Their children are discovered through the rendered OLX DOM (plus the
 * auto-wired `target` attribute), and their state is aggregated with the
 * same semantics the old useEffect mirror had: worst-case correctness,
 * messages joined, score = count of correct children, submitCount = max.
 *
 * If the node isn't in the DOM yet (not rendered, or a non-React caller),
 * falls back to reading stored fields — correct for leaf graders, and a
 * harmless ungraded default for anything else.
 */
export function selectGradingState(
  state: any,
  props: RuntimeProps,
  graderStateKey: StateKey | undefined,
): GraderGradingState {
  if (!graderStateKey) return UNGRADED;
  const node = getDomNodeByStateKey(props, graderStateKey);
  const loBlock = node?.loBlock;

  if (node && loBlock?.isGrader && typeof loBlock.action !== 'function') {
    // Metagrader: derive from children.
    const selfId = node.olxJson?.id;
    const childIds = inferRelatedNodes(
      { ...props, nodeInfo: node },
      {
        selector: n => n.loBlock?.isGrader && n.olxJson?.id !== selfId,
        infer: ['kids'],
        targets: node.olxJson?.attributes?.target,
      }
    );
    if (childIds.length === 0) return UNGRADED;
    const kids = childIds.map(id => selectGradingState(state, props, id));
    return {
      correct: worstCaseCorrectness(kids.map(k => k.correct)),
      // TODO: message aggregation is known-bad for multipart problems
      // (feedback floats to the footer disconnected from its question).
      // Kept as-is pending the multipart feedback redesign.
      message: kids.map(k => k.message).filter(Boolean).join(' '),
      score: kids.filter(k => k.correct === correctness.correct).length,
      submitCount: Math.max(0, ...kids.map(k => k.submitCount)),
    };
  }

  // Leaf grader (or unrendered node): stored fields. Field defs come from
  // the block when known so overridden field types resolve; commonFields
  // otherwise.
  const read = <T,>(name: string, fallback: T): T => {
    const field = (loBlock?.fields?.[name] as any) ?? (commonFields as any)[name];
    return fieldSelector(state, props, field, {
      stateKey: graderStateKey,
      fallback,
      selector: s => (s?.[name] ?? fallback) as T,
    });
  };
  return {
    correct: read<string>('correct', correctness.unsubmitted),
    message: read<string>('message', ''),
    score: read<number | undefined>('score', undefined),
    submitCount: read<number>('submitCount', 0),
  };
}

/**
 * React hook: subscribe to a grader's grading state.
 * graderStateKey is typically props.graderId (injected by render for
 * requiresGrader blocks) or the block's own nodeInfo.stateKey.
 */
export function useCorrectness(props: RuntimeProps, graderStateKey: StateKey | undefined): GraderGradingState {
  return useSelector(
    (state: any) => selectGradingState(state, props, graderStateKey),
    shallowEqual,
  );
}
