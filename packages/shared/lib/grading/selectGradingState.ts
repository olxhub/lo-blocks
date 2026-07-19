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
import {
  GRADING_STATE_FIELDS, PENDING_GRADE_TIMEOUT_MS, UNGRADED,
  readGradingField, readStoredGradingState,
} from './gradingStore';
import type { PendingGrade } from './gradingStore';
import { schedulePendingTimeout } from './pendingTimeout';
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
    // The outer `descriptor` IS preparation.prepared.descriptor (same object) —
    // no need to re-destructure it under a second name.
    const { graderProps, param } = preparation.prepared;
    // Async graders are rejected from immediate problems at authoring time
    // (CapaProblem renders a DisplayError), so reaching one here is a broken
    // invariant. The declaration-key discriminant (grader: vs asyncGrader:)
    // makes the sync return type a fact — a SyncGraderFn returns a
    // RawGraderResult, never a Promise.
    if (descriptor.execution !== 'sync') {
      throw new Error(`[grading] ${loBlock.name} is async; it cannot evaluate in immediate mode`);
    }
    // Insurance for the one shape the definition-time AsyncFunction check can't
    // see: a plain (non-`async`) function declared under grader: that
    // nonetheless returns a Promise. This restores the load-bearing diagnostic
    // the old Promise duck-type gave, naming the block and the asyncGrader:
    // remedy — at the point evaluation would otherwise treat a thenable as a
    // grade result.
    const raw = descriptor.fn(graderProps, param);
    if (raw instanceof Promise) {
      throw new Error(
        `[grading] ${loBlock.name}: grader: returned a Promise — declare it under asyncGrader:.`,
      );
    }
    result = normalizeGraderResult(raw);
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

/**
 * The stored-leaf read, plus the async-pending TIMEOUT policy.
 *
 * A stored correct='submitted' means an async submission went in flight. It
 * counts as genuinely pending ONLY while a pendingGrade record exists AND that
 * record is younger than PENDING_GRADE_TIMEOUT_MS. Past the deadline — or
 * 'submitted' with NO record (legacy-shape data written before this field
 * existed) — the async job has STRANDED: today the only async grader is
 * client-side (callLLMSimple), so a reload killed the request and nothing will
 * ever write the result (see the PendingGrade breadcrumb in gradingStore.ts).
 *
 * We then derive a FAILED-RETRYABLE state: `correct` is no longer 'submitted'
 * (correctness.invalid — the answer was never judged), so BOTH the submission
 * guard (submitGrade) and useInputReadOnly treat it as retryable — inputs
 * unlock and a fresh submit overwrites the stale pendingGrade record — and the
 * learner sees a try-again message.
 *
 * PURITY: the flip is evaluated at READ TIME from Date.now() — the derivation
 * itself owns no timer. Any dispatch/render after the deadline sees the failed
 * state; one that lands before it still sees pending. selectGradingState no
 * longer PINS a still-pending result in its memo (see there), so every read
 * re-samples Date.now() — the flip is observed the instant a read happens past
 * the deadline. What makes a read happen at the deadline is the ONE pragmatic
 * side effect: while the record is still fresh we ensure a browser timer exists
 * (schedulePendingTimeout) that will dispatch PENDING_GRADE_TIMEOUT then. This
 * covers RELOAD (a stranded record read on a fresh page arms its own timer);
 * submitGrade's phase-1 arms the same timer in-session. The scheduler is a
 * browser-only no-op in headless/node grading (analytics, replay, server), and
 * arming it here is the same class of read-time impurity the Date.now() read
 * already is — documented, bounded, not a bug.
 */
function readStoredLeafState(
  state: unknown, props: RuntimeProps, stateKey: StateKey, loBlock: LoBlock | undefined,
): GradingState {
  const stored = readStoredGradingState(state, props, stateKey, loBlock);
  if (stored.correct !== correctness.submitted) return stored;

  const pending = readGradingField<PendingGrade | undefined>(
    state, props, stateKey, loBlock, 'pendingGrade', undefined);
  const fresh = pending && (Date.now() - pending.submittedAt) < PENDING_GRADE_TIMEOUT_MS;
  if (fresh) {
    // Still pending: guarantee the deadline will fire a dispatch so this
    // derivation is re-read and the UI unlocks even if nothing else moves the
    // store. Browser-only, deduped per stateKey (see pendingTimeout.ts).
    schedulePendingTimeout(props, stateKey, pending.submittedAt + PENDING_GRADE_TIMEOUT_MS);
    return stored;
  }

  return {
    ...stored,
    correct: correctness.invalid,
    message: 'Grading did not complete. Please try again.',
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
  // gradeModeOf reads the parse-time stamp the enclosing problem wrote
  // (see CapaProblem.ts) — no ancestor walk, no dynamic DOM.
  if (loBlock.grading && loBlock.grading.execution !== 'async' && gradeModeOf(entry) === 'immediate') {
    return deriveImmediateState(state, props, stateKey, loBlock);
  }
  // Stored leaf — submit mode and the async pending→final lifecycle, including
  // the stranded-pending timeout (readStoredLeafState).
  return readStoredLeafState(state, props, stateKey, loBlock);
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
  // A still-pending result ('submitted') is TIME-DEPENDENT: it flips to
  // failed-retryable the moment Date.now() crosses the deadline (see
  // readStoredLeafState). Pinning it in this per-state memo would keep
  // handing back 'submitted' for reads within the SAME state generation even
  // after the deadline — the memo would out-live the value's truth. So cache
  // everything terminal and re-derive pending on each read (cheap, and it
  // re-samples the clock); the scheduled PENDING_GRADE_TIMEOUT dispatch is what
  // forces a read once the deadline arrives.
  if (result.correct !== correctness.submitted) byKey.set(graderStateKey, result);
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
