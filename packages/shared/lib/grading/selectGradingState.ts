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
import { correctness, countsAsAttempt } from '../blocks/correctness';
import { aggregateGradingStates } from './aggregators';
import {
  prepareGrade, preparationErrorResult, normalizeGraderResult,
} from './pipeline';
import { GRADING_STATE_FIELDS, UNGRADED, readStoredGradingState } from './gradingStore';
import { childGraderStateKeys, gradeModeOf } from './topology';
import { staticEntryForStateKey, blueprintFor } from '../blocks/staticDom';
import type { GraderInput, GradingResult, GradingState } from './model';
import type { LoBlock, RuntimeProps, StateKey } from '../types';

export type { GradingState };

// ---------------------------------------------------------------------------
// Grader classification — all from the static DOM + registry (topology.ts)
// ---------------------------------------------------------------------------

/** A metagrader aggregates children; only the grader() mixin sets `grading`. */
function isMetagrader(loBlock: LoBlock): boolean {
  return loBlock.isGrader && !loBlock.grading;
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
  let result: GradingResult;
  if (preparation.ok) {
    const { descriptor: prepared, graderProps, param } = preparation.prepared;
    // Async graders are rejected from immediate problems at authoring time
    // (CapaProblem renders a DisplayError), so reaching one here is a broken
    // invariant. The discriminated descriptor makes the sync return type a
    // fact — a SyncGraderFn returns a RawGraderResult, never a Promise, so no
    // Promise duck-typing on the result.
    if (prepared.execution !== 'sync') {
      throw new Error(`[grading] ${loBlock.name} is async; it cannot evaluate in immediate mode`);
    }
    result = normalizeGraderResult(prepared.fn(graderProps, param));
  } else {
    // preparationErrorResult is already normalized — no second pass.
    result = preparationErrorResult(preparation.error);
  }
  const correct = softenLiveIncorrectResult(result.correct, preparation.inputs);

  // submitCount is derived attempted-ness (there are no submit events in
  // immediate mode): any live-graded interaction counts as one attempt, so
  // completion (problemCompletion → inProgress) and showanswer="attempted"
  // behave.
  return { ...result, correct, submitCount: countsAsAttempt(correct) ? 1 : 0 };
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
  // gradeModeOf reads the parse-time stamp the enclosing problem wrote
  // (see CapaProblem.ts) — no ancestor walk, no dynamic DOM.
  if (loBlock.grading && loBlock.grading.execution !== 'async' && gradeModeOf(entry) === 'immediate') {
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
  // Memoized on (state, runtime, stateKey) — every input the computation
  // reads: the Redux snapshot AND props.runtime (blockRegistry, ns, locale,
  // olxJsonSources). runtime nests inside state so the same snapshot under a
  // different runtime can't collide; both are stable-identity objects, so a
  // WeakMap discards each generation as soon as it's unreferenced.
  const runtime = props.runtime as unknown as object;
  let byRuntime = _memo.get(state as object);
  if (!byRuntime) { byRuntime = new WeakMap(); _memo.set(state as object, byRuntime); }
  let byKey = byRuntime.get(runtime);
  if (!byKey) { byKey = new Map(); byRuntime.set(runtime, byKey); }
  const cached = byKey.get(graderStateKey);
  if (cached) return cached;
  const result = computeGradingState(state, props, graderStateKey);
  byKey.set(graderStateKey, result);
  return result;
}

const _memo = new WeakMap<object, WeakMap<object, Map<StateKey, GradingState>>>();

/**
 * The grading quartet as blueprint selectors — declared by the grader()
 * mixin and the metagraders. Each field routes through selectGradingState,
 * whose strategies (stored / immediate / aggregate) stay grading-internal.
 * A constant derived from GRADING_STATE_FIELDS (the declarations are static;
 * every grader block shares this one object).
 */
export const gradingSelectors: Record<string, (state: unknown, props: RuntimeProps, stateKey: StateKey) => unknown> =
  Object.fromEntries(
    GRADING_STATE_FIELDS.map(name => [
      name,
      (state: unknown, props: RuntimeProps, stateKey: StateKey) => selectGradingState(state, props, stateKey)[name],
    ]),
  );
