// packages/shared/lib/grading/submitGrade.ts
//
// Submit-mode grading: the grader() mixin and the persisted grading
// lifecycle. Preparation and evaluation are the shared pipeline
// (pipeline.ts); this module owns what is unique to submission —
// the pending state for async graders, attempt accounting, and writing
// the result as per-field CRDT events.
//
import { correctness, countsAsAttempt } from '../blocks/correctness';
import { graderAttributes } from '../blocks/attributeSchemas';
import { toAppError } from '@/lib/types/errors';
import { updateField } from '../state/fieldWrites';
import type { Correctness } from '../blocks/correctness';
import type { LoBlock, ObservableValue, RuntimeProps, StateKey } from '../types';
import type {
  AsyncGraderFn, GradePreparation, GraderFn, GradingDescriptor, GradingResult,
  InputBinding, SyncGraderFn,
} from './model';
import {
  prepareGrade, evaluateGrade, preparationErrorResult, normalizeGraderResult,
} from './pipeline';
import { gradingField, readGradingField } from './gradingStore';
import { gradingSelectors } from './selectGradingState';

/** Blank and malformed submissions don't consume attempts (countsAsAttempt). */
function nextSubmitCount(current: number, correct: Correctness): number {
  return current + (countsAsAttempt(correct) ? 1 : 0);
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
    return normalizeGraderResult(await evaluateGrade(preparation.prepared));
  } catch (error: unknown) {
    console.error('[grading] evaluation failed:', error);
    return {
      correct: correctness.invalid,
      message: `Grading failed: ${toAppError(error).message}. Please try again.`,
    };
  }
}

// Async submissions in flight, per runtime, keyed by the grader's scoped
// stateKey. Keyed by runtime (props.runtime — the identity selectGradingState
// memoizes on) so two stores/runtimes sharing a content key don't suppress
// each other's grades. The Redux 'submitted' check is the persistent
// cross-session guard; this WeakMap is its atomic same-session half — the
// queued correct='submitted' event hasn't folded when a fast second click
// arrives.
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
    // inputs lock via useInputReadOnly. A final unsubmitted/invalid result
    // (e.g. empty input) simply overwrites the transient pending state.
    updateField(props, gradingField(loBlock, 'correct'), correctness.submitted, { stateKey });
  }

  const result = await evaluateSubmission(preparation);

  // Attempt accounting reads FRESH state: the grader may have awaited, and the
  // pre-evaluation snapshot could hold a stale count.
  const submitCount = nextSubmitCount(
    readGradingField(props.runtime.store.getState(), props, stateKey, loBlock, 'submitCount', 0),
    result.correct,
  );

  persistGradeResult(props, stateKey, loBlock, result, submitCount);
  return result.correct;
}

/** The submission lifecycle for one grader instance. Sync graders complete in
 *  one turn and need no lock; async graders serialize per (runtime, stateKey)
 *  and additionally honor the persisted cross-session 'submitted' guard. */
async function submitGrade(props: RuntimeProps, stateKey: StateKey, descriptor: GradingDescriptor) {
  if (descriptor.execution !== 'async') {
    return runSubmission(props, stateKey, descriptor);
  }
  return withSubmissionLock(props.runtime as unknown as object, stateKey, async () => {
    // Cross-session half: a prior submission already landed 'submitted'
    // (survives reload). The in-flight lock is the atomic same-session half.
    const pending = readGradingField<Correctness>(
      props.runtime.store.getState(), props, stateKey, props.loBlock, 'correct', correctness.unsubmitted);
    if (pending === correctness.submitted) return undefined;
    return runSubmission(props, stateKey, descriptor);
  });
}

// ---------------------------------------------------------------------------
// The grader() mixin
// ---------------------------------------------------------------------------

/**
 * Normalize the caller-facing options into the discriminated descriptor the
 * pipeline consumes. `slots` and `inputType` collapse into one InputBinding —
 * declaring BOTH is the ambiguity this kills, so it throws at definition time
 * rather than silently applying a slots-win precedence rule. The sync/async
 * cast is the one place the loose GraderFn meets the strict fn types: a block
 * that declares execution:'sync' promises its fn returns synchronously.
 */
function normalizeGradingDescriptor(
  grader: GraderFn, infer: boolean, execution: 'sync' | 'async',
  slots?: string[], inputType?: 'single' | 'list',
): GradingDescriptor {
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
  return execution === 'async'
    ? { execution, fn: grader as AsyncGraderFn, inputs, infer }
    : { execution: 'sync', fn: grader as SyncGraderFn, inputs, infer };
}

// Helper to define a grading action. This used to be called a
// "response" in OLX 1.0 terminology.
//
// Param shape the grade function receives:
// - slots defined: { inputDict, inputApiDict } - named slots
// - inputType: 'list': { inputList, inputApis } - array of inputs
// - default (single): { input, inputApi } - one input (most common)
export function grader({ grader, infer = true, slots, inputType, execution = 'sync' }: {
  grader: GraderFn;
  infer?: boolean;
  slots?: string[];
  inputType?: 'single' | 'list';
  /** How grading completes. 'async' — LLM, instructor/peer queue,
   *  code-in-sandbox: the action writes correct='submitted' BEFORE
   *  awaiting the grader, so the UI shows a pending state and inputs lock
   *  (useInputReadOnly) while grading is in flight; the final result
   *  overwrites it when it lands. UI reads via useGradingState/selectors,
   *  so both phases are ordinary field writes. */
  execution?: 'sync' | 'async';
}) {
  const descriptor = normalizeGradingDescriptor(grader, infer, execution, slots, inputType);

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
