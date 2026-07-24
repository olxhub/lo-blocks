// packages/shared/lib/grading/submitGrade.ts
//
// Submit-mode grading: the grader() mixin and the persisted grading
// lifecycle. Preparation and evaluation are the shared pipeline
// (pipeline.ts); this module owns what is unique to submission —
// the pending state for async graders, attempt accounting, and writing
// the result as per-field CRDT events.
//
import { correctness, countsAsAttempt } from './correctness';
import { graderAttributes } from '../blocks/attributeSchemas';
import { toAppError } from '@/lib/types/errors';
import { updateField } from '../state/fieldWrites';
import type { Correctness } from './correctness';
import type { LoBlock, ObservableValue, RuntimeProps, StateKey } from '../types';
import type {
  AsyncGraderFn, GradePreparation, GradingDescriptor, GradingResult,
  InputBinding, SyncGraderFn,
} from './model';
import {
  prepareGrade, preparationErrorResult, normalizeGraderResult,
} from './pipeline';
import { gradingField, readGradingField, PENDING_GRADE_TIMEOUT_MS } from './gradingStore';
import type { PendingGrade } from './gradingStore';
import { schedulePendingTimeout, clearPendingTimeout } from './pendingTimeout';
import { gradingSelectors, selectGradingState } from './selectGradingState';

/** Blank and malformed submissions don't consume attempts (countsAsAttempt). */
function nextSubmitCount(current: number, correct: Correctness): number {
  return current + (countsAsAttempt(correct) ? 1 : 0);
}

/** Mint the pending record's id. A client GUID today; in the follow-up the
 *  SERVER mints a durable job ID and writes the record instead (see the
 *  PendingGrade breadcrumb in gradingStore.ts). Falls back to time+random in
 *  Node test environments where crypto.randomUUID is absent. */
function mintPendingGradeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Write a grading result as per-field CRDT events. The only place that
 * knows the write protocol: each field is its own event with its own
 * conflict-resolution metadata, and `correct` goes last so anything keying
 * off it observes the other fields already settled.
 */
function persistGradeResult(
  props: RuntimeProps,
  stateKey: StateKey,
  loBlock: LoBlock,
  result: GradingResult,
  submitCount: number,
): void {
  const writeOpts = { stateKey };
  updateField(props, gradingField(loBlock, 'message'), result.message, writeOpts);
  updateField(props, gradingField(loBlock, 'score'), result.score, writeOpts);
  updateField(props, gradingField(loBlock, 'submitCount'), submitCount, writeOpts);
  updateField(props, gradingField(loBlock, 'correct'), result.correct, writeOpts);
}

/**
 * Grade functions can fail for reasons outside our control (a rejected
 * LLM call, a lazy engine that failed to load, a grader bug — including
 * returning a malformed result). Everything inside the boundary converts
 * to a terminal invalid result so the pending 'submitted' state never
 * strands — inputs lock while it persists (useInputReadOnly) — and the
 * attempt isn't counted (the answer was never judged).
 */
async function evaluateSubmission(preparation: GradePreparation): Promise<GradingResult> {
  if (!preparation.ok) return preparationErrorResult(preparation.error);
  try {
    // Blueprints with slow dependencies (e.g. FormulaGrader's mathjs)
    // declare ensureReady; await it so a synchronous match function runs
    // against a loaded engine. The await on evaluate accepts async grade
    // functions — LLM, code-in-sandbox. Normalization is INSIDE the
    // boundary: a malformed result (missing `correct`) must not strand
    // the pending state either.
    await preparation.prepared.ensureReady?.();
    const { descriptor, graderProps, param } = preparation.prepared;
    return normalizeGraderResult(await descriptor.fn(graderProps, param));
  } catch (error: unknown) {
    console.error('[grading] evaluation failed:', error);
    return {
      correct: correctness.invalid,
      message: `Grading failed: ${toAppError(error).message}. Please try again.`,
    };
  }
}

// Submissions in flight, per runtime, keyed by the grader's scoped stateKey.
// Keyed by runtime (props.runtime — the identity selectGradingState memoizes
// on) so two stores/runtimes sharing a content key don't suppress each other's
// grades. This WeakMap is the atomic same-session guard for ANY grader with an
// await window: an async grader awaiting its result, or a SYNC grader awaiting
// ensureReady (FormulaGrader loading mathjs) — in both a fast second click can
// arrive before the first run's events fold. The persisted 'submitted'/
// pendingGrade record is the separate cross-session guard (async only).
const submissionsInFlight = new WeakMap<object, Set<StateKey>>();

/**
 * Run `fn` while holding the submission lock for (runtime, stateKey). If the
 * lock is already held, `fn` does NOT run and undefined is returned — the
 * duplicate-submission early-return. Release happens in finally ONLY for the
 * invocation that acquired: a duplicate that never acquired can never release
 * the holder's lock (the bug of an unconditional delete).
 */
async function withSubmissionLock<T>(
  runtime: object, stateKey: StateKey, fn: () => Promise<T>,
): Promise<T | undefined> {
  let inFlight = submissionsInFlight.get(runtime);
  if (!inFlight) { inFlight = new Set(); submissionsInFlight.set(runtime, inFlight); }
  if (inFlight.has(stateKey)) return undefined;
  inFlight.add(stateKey);
  try {
    return await fn();
  } finally {
    // Released once the RESULT events are dispatched (persistGradeResult is
    // synchronous dispatch) — from here the folded result governs, and the
    // error path must not strand the in-flight mark.
    inFlight.delete(stateKey);
  }
}

/** Prepare, evaluate, and persist one submission. */
async function runSubmission(
  props: RuntimeProps, stateKey: StateKey, descriptor: GradingDescriptor,
): Promise<Correctness> {
  const loBlock = props.loBlock;
  const preparation = prepareGrade(props, props.runtime.store.getState(), stateKey, descriptor);

  // Capture what is being graded (shown by the UI during async grading and
  // for changed-since-submission indicators afterwards). Preparation resolves
  // inputs even when it fails, so a configuration error still records what the
  // learner actually submitted.
  const submittedValues: ObservableValue[] = preparation.inputs.map(i => i.value);
  updateField(props, gradingField(loBlock, 'lastSubmission'), submittedValues, { stateKey });

  if (descriptor.execution === 'async') {
    // Phase 1 of two-phase grading: pending before awaiting the grader;
    // inputs lock via useInputReadOnly. Alongside correct='submitted' we
    // stamp the DURABLE pendingGrade record — { id, submittedAt } — which is
    // what selectGradingState reads to distinguish a genuinely-pending grade
    // from a stranded one past the timeout. A final unsubmitted/invalid
    // result (e.g. empty input) simply overwrites the transient pending state.
    const pending: PendingGrade = { id: mintPendingGradeId(), submittedAt: Date.now() };
    updateField(props, gradingField(loBlock, 'pendingGrade'), pending, { stateKey });
    updateField(props, gradingField(loBlock, 'correct'), correctness.submitted, { stateKey });
    // In-session liveness: if the grader HANGS (a Promise that never settles),
    // no result dispatch will ever land to re-read the derivation and unlock
    // the inputs. Arm the deadline timer now (browser-only, deduped) so the
    // stranded-pending flip fires even then. A grader that DOES settle clears
    // this below, before the timer fires. (readStoredLeafState arms the same
    // timer on reload, when this call site is gone.)
    schedulePendingTimeout(props, stateKey, pending.submittedAt + PENDING_GRADE_TIMEOUT_MS);
  }

  const result = await evaluateSubmission(preparation);

  // Attempt accounting reads FRESH state: the grader may have awaited, and the
  // pre-evaluation snapshot could hold a stale count.
  const submitCount = nextSubmitCount(
    readGradingField(props.runtime.store.getState(), props, stateKey, loBlock, 'submitCount', 0),
    result.correct,
  );

  persistGradeResult(props, stateKey, loBlock, result, submitCount);
  if (descriptor.execution === 'async') {
    // The result now governs; clear the pending record. Cleared AFTER `correct`
    // (persistGradeResult writes it last) so no reader ever sees the
    // 'submitted'+no-record shape that the timeout derivation reads as failed.
    updateField(props, gradingField(loBlock, 'pendingGrade'), undefined, { stateKey });
    // Cancel the in-session deadline timer we armed at phase 1: the grade
    // landed, so its dispatch would now be a needless (confusing) analytics
    // event minutes later.
    clearPendingTimeout(stateKey);
  }
  return result.correct;
}

/** The submission lifecycle for one grader instance. EVERY submission runs
 *  under the per-(runtime, stateKey) lock: a sync grader that declares
 *  ensureReady (FormulaGrader awaits mathjs) has an await window in which a
 *  double-click could interleave two runs and undercount submitCount, so the
 *  lock is not async-only. The persisted cross-session guard IS async-only —
 *  only async graders leave a durable pending record to honor. */
async function submitGrade(props: RuntimeProps, stateKey: StateKey, descriptor: GradingDescriptor) {
  return withSubmissionLock(props.runtime as unknown as object, stateKey, async () => {
    if (descriptor.execution === 'async') {
      // Cross-session half: a prior submission already landed 'submitted' and
      // survives reload. Read the DERIVED state, not the raw stored `correct`,
      // so a pending grade past PENDING_GRADE_TIMEOUT_MS is retryable — the
      // derived failed state is not 'submitted', so the resubmit proceeds and
      // overwrites the stranded pendingGrade record.
      const derived = selectGradingState(props.runtime.store.getState(), props, stateKey);
      if (derived.correct === correctness.submitted) return undefined;
    }
    return runSubmission(props, stateKey, descriptor);
  });
}

// ---------------------------------------------------------------------------
// The grader() mixin
// ---------------------------------------------------------------------------

/**
 * The caller-facing grader() options. The grading FUNCTION FAMILY is keyed by
 * DECLARATION NAME — the key IS the discriminant, so execution can never be
 * declared to disagree with the fn's actual shape (the two can no longer drift
 * apart, and there is no `execution:` caller option to keep in sync):
 *
 *   grader:      a SyncGraderFn   → execution 'sync'  (evaluable in immediate mode)
 *   asyncGrader: an AsyncGraderFn → execution 'async' (LLM / queue / sandbox;
 *                                   two-phase, gets a pending state, cannot run
 *                                   in grade="immediate" problems)
 *
 * Exactly one must be declared. Future family members (matcher:, other
 * grading-selector kinds) extend by ADDING KEYS here — never by overloading one
 * slot with a mode flag.
 */
interface GraderOptions {
  grader?: SyncGraderFn;
  asyncGrader?: AsyncGraderFn;
  infer?: boolean;
  slots?: string[];
  inputType?: 'single' | 'list';
}

/**
 * Normalize the caller-facing options into the discriminated descriptor the
 * pipeline consumes. Two definition-time guards:
 *  - exactly one of grader:/asyncGrader: (the key picks execution; declaring
 *    both — or neither — is a definition error, not a silent default);
 *  - `slots` and `inputType` collapse into one InputBinding — declaring BOTH
 *    is an ambiguity, so it throws rather than applying a slots-win rule.
 * Each key is typed to its own fn shape (SyncGraderFn / AsyncGraderFn), so the
 * descriptor's fn is built with NO cast.
 */
function normalizeGradingDescriptor(
  { grader, asyncGrader, infer = true, slots, inputType }: GraderOptions,
): GradingDescriptor {
  if ((grader ? 1 : 0) + (asyncGrader ? 1 : 0) !== 1) {
    throw new Error(
      `grader(): declare exactly one of grader: (synchronous) or asyncGrader: ` +
      `(returns a Promise — LLM, instructor/peer queue, code-in-sandbox). ` +
      `Got ${grader && asyncGrader ? 'both' : 'neither'}.`,
    );
  }
  if (slots && slots.length > 0 && inputType) {
    throw new Error(
      `grader(): pass either slots or inputType, not both ` +
      `(got slots=[${slots.join(', ')}] and inputType='${inputType}').`,
    );
  }
  const inputs: InputBinding =
    slots && slots.length > 0 ? { kind: 'slots', names: slots }
    : inputType === 'list' ? { kind: 'list' }
    : { kind: 'single' };

  if (asyncGrader) {
    return { execution: 'async', fn: asyncGrader, inputs, infer };
  }
  // Synchronous grader. JS won't stop an `async` function declared under
  // grader: — but that would strand immediate-mode evaluation (which calls the
  // fn expecting a value, not a Promise). Catch the common case (a genuine
  // `async` function) HERE at definition time; a plain function that happens to
  // return a Promise slips this check and is caught at the immediate-mode call
  // site (see deriveImmediateState).
  if (grader!.constructor?.name === 'AsyncFunction') {
    throw new Error(
      `grader(): the function under grader: is an async function — ` +
      `declare it under asyncGrader: instead.`,
    );
  }
  return { execution: 'sync', fn: grader!, inputs, infer };
}

// Helper to define a grading action. This used to be called a
// "response" in OLX 1.0 terminology.
//
// Param shape the grade function receives:
// - slots defined: { inputDict, inputApiDict } - named slots
// - inputType: 'list': { inputList, inputApis } - array of inputs
// - default (single): { input, inputApi } - one input (most common)
//
// Declare the grade function under grader: (synchronous) or asyncGrader:
// (returns a Promise) — see GraderOptions. execution is DERIVED from that key,
// never passed.
export function grader(options: GraderOptions) {
  const { slots } = options;
  const descriptor = normalizeGradingDescriptor(options);

  const action = async ({ props }: { props: RuntimeProps }) => {
    // executeNodeActions builds props from the grader's own dynamic-DOM
    // node; only its stateKey (the instance identity) is used — grading
    // itself runs off the static DOM.
    return submitGrade(props, props.nodeInfo.stateKey, descriptor);
  };

  // Everything the helper contributes is packaged as a `graderMixin` layer.
  // createBlock's composition pass merges this layer into the final
  // blueprint, so callers get `isGrader`, the grading action, `slots`,
  // `getDisplayAnswer`, and the `answer`/`displayAnswer`/`target`
  // attributes without declaring them at the top level themselves.
  return {
    graderMixin: {
      action,
      isGrader: true,
      // One descriptor for everything the grading pipeline needs outside
      // the action itself (derived immediate-mode evaluation, async-grader
      // detection). A blueprint with isGrader but NO `grading` descriptor
      // is a metagrader (CapaProblem) — its state derives from child
      // graders.
      grading: descriptor,
      // Grading state reads as computed fields (see FieldSelector) —
      // stored in submit mode, derived in immediate mode; the selector
      // dispatches.
      selectors: gradingSelectors,
      slots,  // Named slots for multi-input graders
      // Default display answer - can be overridden in block definition
      getDisplayAnswer: (props: RuntimeProps) => props.displayAnswer ?? props.answer,
      attributes: graderAttributes,
    },
  };
}
