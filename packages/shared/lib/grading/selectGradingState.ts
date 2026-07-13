// packages/shared/lib/grading/selectGradingState.ts
//
// The read model for grading state. Pure — no React; the hook wrapper is
// useGradingState.ts.
//
// Principle: STORE FACTS AT THE LEAVES, DERIVE EVERYTHING ABOVE.
// Three strategies, chosen by what the grader IS:
//
//   metagrader (isGrader, no grading descriptor — CapaProblem)
//     → aggregate direct child graders on read. No stored mirror state,
//       no replay problem; orchestrators (MasteryBank) observe child
//       grading without a submit round-trip.
//   immediate leaf (sync grader inside a grade="immediate" problem)
//     → evaluate the grade function over the LIVE input values, right in
//       the selector. No events, no submit button, no race against the
//       event queue.
//   stored leaf (everything else)
//     → read the per-field state the grading action wrote (submitGrade.ts).
//       Covers submit mode and the slow/async pending→final lifecycle.
//
import { correctness } from '../blocks/correctness';
import { getDomNodeByStateKey, getParents } from '../blocks/olxdom';
import { inferRelatedNodes } from '../blocks/olxdom';
import { aggregateGradingStates } from './aggregators';
import {
  prepareGrade, evaluateGrade, preparationErrorResult, gradingField, normalizeGraderResult,
} from './pipeline';
import { fieldSelector } from '../state/redux';
import type { GraderInput, GradingState } from './model';
import type { LoBlock, OlxDomNode, RuntimeProps, StateKey } from '../types';

export type { GradingState };

const UNGRADED: GradingState = {
  correct: correctness.unsubmitted,
  message: '',
  score: undefined,
  submitCount: 0,
};

// ---------------------------------------------------------------------------
// Grader classification
// ---------------------------------------------------------------------------

/** A metagrader aggregates children; only the grader() mixin sets `grading`. */
function isMetagrader(loBlock: LoBlock): boolean {
  return loBlock.isGrader && !loBlock.grading;
}

/**
 * The grading mode a node lives under: its nearest enclosing problem
 * (metagrader) decides. A problem without a `grade` attribute is
 * submit-mode (the default), so a plain nested <CapaProblem> inside an
 * immediate one grades on submit rather than inheriting immediacy.
 */
export function gradingModeFor(node: OlxDomNode): 'immediate' | 'submit' {
  const boundary = getParents(node, {
    selector: n => isMetagrader(n.loBlock) || typeof n.olxJson.attributes.grade === 'string',
  });
  return boundary[0]?.olxJson.attributes.grade === 'immediate' ? 'immediate' : 'submit';
}

/** Null-tolerant convenience for components (GraderShell). */
export function isImmediateContext(node: OlxDomNode | null | undefined): boolean {
  return node ? gradingModeFor(node) === 'immediate' : false;
}

/**
 * The DIRECT child graders of a metagrader — a nested problem is a
 * boundary. The DOM walk returns every descendant grader, so an outer
 * problem would otherwise count an inner CapaProblem AND its leaf graders
 * (double-counting scores, and evaluating the inner leaves under the outer
 * problem's grade mode instead of the inner's own). Identity is by DOM
 * node, not definition id: repeated instances of one definition (e.g.
 * MasteryBank's attempt-scoped remounts) are distinct graders.
 */
function findDirectChildGraders(props: RuntimeProps, node: OlxDomNode): StateKey[] {
  const descendantIds = inferRelatedNodes(
    { ...props, nodeInfo: node },
    {
      selector: n => n.loBlock.isGrader && n !== node,
      infer: ['kids'],
      targets: node.olxJson.attributes.target,
    }
  );
  return descendantIds.filter(id => {
    // A missing node is a mid-mount transient (the DOM registers top-down);
    // include it — its own selectGradingState falls back to stored fields.
    const childNode = getDomNodeByStateKey(props, id);
    for (let cur = childNode?.parent; cur && cur !== node; cur = cur.parent) {
      if (cur.loBlock.isGrader) return false; // enclosed by a nearer grader
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// The three strategies
// ---------------------------------------------------------------------------

function deriveMetagraderState(state: unknown, props: RuntimeProps, node: OlxDomNode): GradingState {
  const childIds = findDirectChildGraders(props, node);
  if (childIds.length === 0) return UNGRADED;
  return aggregateGradingStates(childIds.map(id => selectGradingState(state, props, id)));
}

/**
 * Live-feedback presentation policy: a non-match only renders as
 * `incorrect` when every input commits on change (radio buttons, dropdowns
 * — each interaction is a deliberate answer). Free-form inputs soften to
 * `incomplete` so a learner mid-answer ("4" on the way to "42") never sees
 * a red X.
 */
function softenLiveIncorrectResult(
  correct: GradingState['correct'], inputs: GraderInput[],
): GradingState['correct'] {
  if (correct !== correctness.incorrect) return correct;
  const allCommitOnChange = inputs.length > 0 && inputs.every(i => i.commitOnChange);
  return allCommitOnChange ? correct : correctness.incomplete;
}

function deriveImmediateState(state: unknown, props: RuntimeProps, node: OlxDomNode): GradingState {
  const descriptor = node.loBlock.grading!;
  const preparation = prepareGrade(props, state, node, descriptor);
  const raw = preparation.ok ? evaluateGrade(preparation.prepared) : preparationErrorResult(preparation.error);
  if (raw && typeof (raw as Promise<unknown>).then === 'function') {
    // Slow graders are rejected from immediate problems at authoring time
    // (CapaProblem renders a DisplayError), so an async result here is a
    // broken invariant, not a mode to fall back from.
    throw new Error(`[grading] ${node.loBlock.name} returned a Promise during immediate evaluation`);
  }
  const result = normalizeGraderResult(raw as Awaited<typeof raw>);
  const correct = softenLiveIncorrectResult(result.correct, preparation.inputs);

  // submitCount is derived attempted-ness (there are no submit events in
  // immediate mode): any live-graded interaction counts as one attempt, so
  // completion (problemCompletion → inProgress) and showanswer="attempted"
  // behave.
  const attempted = correct !== correctness.unsubmitted && correct !== correctness.invalid;
  return { ...result, correct, submitCount: attempted ? 1 : 0 };
}

/** Stored per-field state, honoring block-specific field overrides —
 *  the read half of submitGrade's write contract (gradingField). */
function readStoredGradingState(
  state: unknown, props: RuntimeProps, stateKey: StateKey, loBlock: LoBlock | undefined,
): GradingState {
  const read = <T,>(name: 'correct' | 'message' | 'score' | 'submitCount', fallback: T): T =>
    fieldSelector(state, props, gradingField(loBlock, name), { stateKey, fallback });
  return {
    correct: read('correct', correctness.unsubmitted),
    message: read('message', ''),
    score: read<number | undefined>('score', undefined),
    submitCount: read('submitCount', 0),
  };
}

// ---------------------------------------------------------------------------
// Dispatch + memoization
// ---------------------------------------------------------------------------

function computeGradingState(state: unknown, props: RuntimeProps, stateKey: StateKey): GradingState {
  const node = getDomNodeByStateKey(props, stateKey);
  // Not rendered (or a non-React caller before mount): stored fields are
  // the only truth available.
  if (!node) return readStoredGradingState(state, props, stateKey, undefined);

  if (isMetagrader(node.loBlock)) return deriveMetagraderState(state, props, node);
  if (node.loBlock.grading && !node.loBlock.grading.slow && gradingModeFor(node) === 'immediate') {
    return deriveImmediateState(state, props, node);
  }
  return readStoredGradingState(state, props, stateKey, node.loBlock);
}

/**
 * Plain (non-hook) selector for a grader's grading state. Usable from
 * actions, orchestrators, the state language, and server code as well as
 * React (via useGradingState).
 *
 * Deliberately UNCACHED: grading depends on the mutable rendered OLX DOM
 * as well as Redux state, and DOM registration doesn't dispatch — a cache
 * keyed on (state, key) can go stale mid-mount (metagrader registered,
 * children not yet). Correctness over saved tree walks; if profiling ever
 * says otherwise, a correct cache needs an OLX-DOM revision in its key.
 */
export function selectGradingState(
  state: unknown,
  props: RuntimeProps,
  graderStateKey: StateKey | undefined,
): GradingState {
  if (!graderStateKey) return UNGRADED;
  return computeGradingState(state, props, graderStateKey);
}
