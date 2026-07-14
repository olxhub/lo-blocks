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
//       Covers submit mode and the async pending→final lifecycle.
//
import { correctness } from '../blocks/correctness';
import { aggregateGradingStates } from './aggregators';
import {
  prepareGrade, evaluateGrade, preparationErrorResult, gradingField, normalizeGraderResult,
} from './pipeline';
import { staticEntryForStateKey, blueprintFor, childGraderStateKeys, gradeModeOf } from './topology';
import { fieldSelector } from '../state/redux';
import type { GraderInput, GradingState } from './model';
import type { LoBlock, OlxJson, RuntimeProps, StateKey } from '../types';

export type { GradingState };

const UNGRADED: GradingState = {
  correct: correctness.unsubmitted,
  message: '',
  score: undefined,
  submitCount: 0,
};

// ---------------------------------------------------------------------------
// Grader classification — all from the static DOM + registry (topology.ts)
// ---------------------------------------------------------------------------

/** A metagrader aggregates children; only the grader() mixin sets `grading`. */
function isMetagrader(loBlock: LoBlock): boolean {
  return loBlock.isGrader && !loBlock.grading;
}

/**
 * Is this block's grading mode immediate? Reads the parse-time gradeMode
 * stamp its enclosing problem wrote (see CapaProblem.ts) — no ancestor
 * walk, no dynamic DOM. Component convenience (GraderShell): the stamp is
 * also spread into props as props.gradeMode.
 */
export function isImmediateEntry(entry: OlxJson): boolean {
  return gradeModeOf(entry) === 'immediate';
}

// ---------------------------------------------------------------------------
// The three strategies
// ---------------------------------------------------------------------------

function deriveMetagraderState(state: unknown, props: RuntimeProps, metagraderKey: StateKey): GradingState {
  const directChildGraderStateKeys = childGraderStateKeys(state, props, metagraderKey);
  if (directChildGraderStateKeys.length === 0) return UNGRADED;
  return aggregateGradingStates(
    directChildGraderStateKeys.map(stateKey => selectGradingState(state, props, stateKey)),
  );
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

function deriveImmediateState(
  state: unknown, props: RuntimeProps, graderKey: StateKey, loBlock: LoBlock,
): GradingState {
  const descriptor = loBlock.grading!;
  const preparation = prepareGrade(props, state, graderKey, descriptor);
  const raw = preparation.ok ? evaluateGrade(preparation.prepared) : preparationErrorResult(preparation.error);
  if (raw && typeof (raw as Promise<unknown>).then === 'function') {
    // Async graders are rejected from immediate problems at authoring time
    // (CapaProblem renders a DisplayError), so an async result here is a
    // broken invariant, not a mode to fall back from.
    throw new Error(`[grading] ${loBlock.name} returned a Promise during immediate evaluation`);
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
  const entry = staticEntryForStateKey(state, props, stateKey);
  // Content not loaded yet: stored fields are the only truth available
  // (heals on the content dispatch).
  if (!entry) return readStoredGradingState(state, props, stateKey, undefined);
  const loBlock = blueprintFor(props, entry);
  if (!loBlock) return readStoredGradingState(state, props, stateKey, undefined);

  if (isMetagrader(loBlock)) return deriveMetagraderState(state, props, stateKey);
  if (loBlock.grading && loBlock.grading.execution !== 'async' && isImmediateEntry(entry)) {
    return deriveImmediateState(state, props, stateKey, loBlock);
  }
  return readStoredGradingState(state, props, stateKey, loBlock);
}

/**
 * Plain (non-hook) selector for a grader's grading state. Usable from
 * actions, orchestrators, the state language, and server code as well as
 * React (via useGradingState).
 *
 * A pure function of Redux state (component scope + the static DOM) plus
 * the block registry — the dynamic (rendered) DOM is NOT an input, so
 * grading works for unrendered content (cross-page gating), in analytics,
 * replay, and server code, and every input change arrives via dispatch
 * (no mid-mount staleness). That also makes per-state memoization sound
 * again if profiling ever wants it.
 */
export function selectGradingState(
  state: unknown,
  props: RuntimeProps,
  graderStateKey: StateKey,
): GradingState {
  return computeGradingState(state, props, graderStateKey);
}
