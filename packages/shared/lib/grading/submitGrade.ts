// packages/shared/lib/grading/submitGrade.ts
//
// Submit-mode grading: the grader() mixin and the persisted grading
// lifecycle. Preparation and evaluation are the shared pipeline
// (pipeline.ts); this module owns what is unique to submission —
// the pending state for slow graders, attempt accounting, and writing
// the result as per-field CRDT events.
//
import { correctness } from '../blocks/correctness';
import { graderAttributes } from '../blocks/attributeSchemas';
import { errorMessage } from '../util/errorMessage';
import { updateField, fieldSelector } from '../state/redux';
import type { Correctness } from '../blocks/correctness';
import type { LoBlock, OlxDomNode, RuntimeProps, StateKey } from '../types';
import type { GradePreparation, GraderFn, GradingDescriptor, GradingResult } from './model';
import {
  prepareGrade, evaluateGrade, preparationErrorResult, gradingField, normalizeGraderResult,
  type GradingFieldName,
} from './pipeline';

/** Blank and malformed submissions don't consume attempts. */
function nextSubmitCount(current: number, correct: Correctness): number {
  const isRealSubmission = correct !== correctness.unsubmitted && correct !== correctness.invalid;
  return current + (isRealSubmission ? 1 : 0);
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

function readGradingField<T>(
  state: unknown, props: RuntimeProps, stateKey: StateKey, loBlock: LoBlock,
  name: GradingFieldName, fallback: T,
): T {
  return fieldSelector(state, props, gradingField(loBlock, name), { stateKey, fallback });
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
  if (!preparation.ok) return normalizeGraderResult(preparationErrorResult(preparation.error));
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
      message: `Grading failed: ${errorMessage(error)}. Please try again.`,
    };
  }
}

/** The submission lifecycle for one grader node. */
async function submitGrade(props: RuntimeProps, node: OlxDomNode, descriptor: GradingDescriptor) {
  const stateKey = node.stateKey;
  const loBlock = node.loBlock;
  const state = props.runtime.store.getState();

  // Re-entrancy guard: a submission is already being graded (the button
  // disables on 'submitted', but a fast double-click can race the event
  // queue). Skip rather than launch a duplicate grading call.
  const pending = readGradingField<Correctness>(state, props, stateKey, loBlock, 'correct', correctness.unsubmitted);
  if (descriptor.slow && pending === correctness.submitted) return undefined;

  const preparation = prepareGrade(props, state, node, descriptor);

  // Capture what is being graded (shown by the UI during slow grading and
  // for changed-since-submission indicators afterwards). Preparation
  // resolves inputs even when it fails, so a configuration error still
  // records what the learner actually submitted.
  const submittedValues = preparation.inputs.map(i => i.value);
  updateField(props, gradingField(loBlock, 'lastSubmission'), submittedValues, { stateKey });

  if (descriptor.slow) {
    // Phase 1 of two-phase grading: pending before awaiting the grader;
    // inputs lock via useInputReadOnly. A final unsubmitted/invalid result
    // (e.g. empty input) simply overwrites the transient pending state.
    updateField(props, gradingField(loBlock, 'correct'), correctness.submitted, { stateKey });
  }

  const result = await evaluateSubmission(preparation);

  // Attempt accounting reads FRESH state: the grader may have awaited, and
  // the pre-evaluation snapshot could hold a stale count.
  const freshState = props.runtime.store.getState();
  const submitCount = nextSubmitCount(
    readGradingField(freshState, props, stateKey, loBlock, 'submitCount', 0),
    result.correct,
  );

  persistGradeResult(props, stateKey, loBlock, result, submitCount);
  return result.correct;
}

// ---------------------------------------------------------------------------
// The grader() mixin
// ---------------------------------------------------------------------------

// Helper to define a grading action. This used to be called a
// "response" in OLX 1.0 terminology.
//
// Param shape the grade function receives:
// - slots defined: { inputDict, inputApiDict } - named slots
// - inputType: 'list': { inputList, inputApis } - array of inputs
// - default (single): { input, inputApi } - one input (most common)
export function grader({ grader, infer = true, slots, inputType, slow = false }: {
  grader: GraderFn;
  infer?: boolean;
  slots?: string[];
  inputType?: 'single' | 'list';
  /** Slow (async) grader — LLM, instructor/peer queue, code-in-sandbox.
   *  The action writes correct='submitted' BEFORE awaiting the grader, so
   *  the UI shows a pending state and inputs lock (useInputReadOnly) while
   *  grading is in flight; the final result overwrites it when it lands.
   *  UI reads via useGradingState/selectors, so both phases are ordinary
   *  field writes. */
  slow?: boolean;
}) {
  const descriptor: GradingDescriptor = { fn: grader, inputType, slots, slow, infer };

  const action = async ({ props }: { props: RuntimeProps }) => {
    // executeNodeActions builds props from the grader's own DOM node.
    return submitGrade(props, props.nodeInfo, descriptor);
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
      // the action itself (derived immediate-mode evaluation, slow-grader
      // detection). A blueprint with isGrader but NO `grading` descriptor
      // is a metagrader (CapaProblem) — its state derives from child
      // graders.
      grading: descriptor,
      slots,  // Named slots for multi-input graders
      // Default display answer - can be overridden in block definition
      getDisplayAnswer: (props: RuntimeProps) => props.displayAnswer ?? props.answer,
      attributes: graderAttributes,
    },
  };
}
