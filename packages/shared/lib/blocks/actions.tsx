// packages/shared/lib/blocks/actions.tsx
//
// Block actions system - enables blocks to perform behaviors beyond rendering.
//
// Actions allow blocks to respond to events (clicks, submissions, etc.) by:
// - Grading student inputs and updating correctness state
// - Making LLM API calls to generate dynamic content
// - Triggering workflows across multiple related blocks
//
// Key concepts:
// - `action()` mixin: Makes a block executable with custom logic
// - `grader()` mixin: Specialized action for assessment that collects inputs,
//   runs grading logic, and logs results to learning analytics
// - `input()` mixin: Makes a block's value accessible to other blocks
// - `executeNodeActions()`: Finds and runs all related actions automatically
//
// The system uses inference to automatically find related blocks (inputs for
// graders, targets for actions) based on DOM hierarchy and explicit targeting.
//
// NOTE: Actions receive a Redux store from their caller (typically ActionButton).
// This enables replay mode where a different store provides historical state.
//
import { z } from 'zod';
import { inferRelatedNodes, getDomNodeByStateKey, propsFromNode } from './olxdom';
import * as lo_event from 'lo_event';
import { correctness, normalizeCorrectness } from './correctness';
import { leafDefinitionKeyFromStateKey } from '../types/id-grammar';
import { getBlockByOLXId } from './getBlockByOLXId';
import { valueSelector, updateField } from '@/lib/state/redux';
import { commonFields } from '@/lib/state/commonFields';
import { isZodCompatible, describeZodType } from './zodCompat';
import { inputAttributes, graderAttributes } from './attributeSchemas';
import type { RuntimeProps, DefinitionKey, DefinitionRef, StateKey, LoBlock, ValueSelectorFn } from '@/lib/types';
import type { Store } from 'redux';

// Grader parameter types - each grader receives exactly one of these
export type SingleParam = { input: unknown; inputApi: object };
export type ListParam = { inputList: unknown[]; inputApis: object[] };
export type DictParam = { inputDict: Record<string, unknown>; inputApiDict: Record<string, object> };
export type GraderParams = SingleParam | ListParam | DictParam;

// May return a Promise — the grading action awaits results (slow graders,
// and graders that ready lazy engines before sync match calls).
type GraderResult = { correct: unknown; message: unknown; score?: number };
type GraderFn = (props: RuntimeProps, params: GraderParams) => GraderResult | Promise<GraderResult>;

// Mix-in to make a block an action
export function action({ action }) {
  return { action };
}

export function isAction(loBlock) {
  return typeof loBlock?.action === "function";
}

/**
 * Mix-in to make a block an input (provides a value to graders).
 *
 * Value type declarations (valueSchema)
 * ======================================
 * Inputs declare what type they produce via `valueSchema` (a Zod schema).
 * Graders declare what they accept via `inputSchema`. The system checks
 * structural compatibility at parse time and runtime using base-type
 * comparison — refinements like .positive() or .min(5) are ignored since
 * they narrow values without changing the wire type.
 *
 * Examples:
 * - ChoiceInput: valueSchema: z.string()
 * - CheckboxInput: valueSchema: z.array(z.string())
 * - NumberInput: valueSchema: z.number()
 *
 * This enables plug-and-play composition: course authors can pair any
 * compatible input with any compatible grader.
 */
export function input(opts: { selectValue?: ValueSelectorFn; valueSchema?: z.ZodType } = {}) {
  // Everything the helper contributes is packaged as an `inputMixin` layer.
  // createBlock's composition pass merges this layer into the final blueprint,
  // so callers get `isInput`, `slot` attribute, and any `selectValue`/`valueSchema`
  // without declaring them at the top level themselves.
  return {
    inputMixin: {
      ...opts,
      isInput: true as const,
      attributes: inputAttributes,
    },
  };
}
export function isInput(loBlock: LoBlock) {
  return loBlock.isInput;
}

export function isMatch(loBlock) {
  return typeof loBlock?.locals?.match === 'function';
}

/**
 * Resolve input IDs to named slots.
 *
 * If the grader declares `slots` (e.g., ['numerator', 'denominator']),
 * this function maps inputs to slots by:
 * 1. Explicit `slot="numerator"` attribute on input (highest priority)
 * 2. Positional: first input → first slot, second → second slot
 *
 * Returns { slotMap, errors } where slotMap is { slot: inputId } and errors
 * contains any validation issues (missing slots, unknown slots, etc.)
 */
function resolveInputSlots(
  slots: string[],
  inputIds: StateKey[],
  getInputSlot: (id: StateKey) => string | undefined
): { slotMap: Record<string, string>; errors: string[] } {
  const errors: string[] = [];
  const slotMap: Record<string, string> = {};
  const usedSlots = new Set<string>();
  const slotSet = new Set(slots);

  // First pass: handle explicit slot= attributes
  for (const inputId of inputIds) {
    const explicitSlot = getInputSlot(inputId);
    if (explicitSlot) {
      if (!slotSet.has(explicitSlot)) {
        errors.push(`Unknown slot "${explicitSlot}" on input "${inputId}", expected: ${slots.join(', ')}`);
        continue;
      }
      if (usedSlots.has(explicitSlot)) {
        errors.push(`Duplicate slot "${explicitSlot}" - each slot can only be assigned once`);
        continue;
      }
      slotMap[explicitSlot] = inputId;
      usedSlots.add(explicitSlot);
    }
  }

  // Second pass: positional assignment for remaining inputs
  let slotIndex = 0;
  for (const inputId of inputIds) {
    const explicitSlot = getInputSlot(inputId);
    if (explicitSlot) continue; // Already handled

    // Find next unassigned slot
    while (slotIndex < slots.length && usedSlots.has(slots[slotIndex])) {
      slotIndex++;
    }

    if (slotIndex >= slots.length) {
      errors.push(`Too many inputs: grader expects ${slots.length} (${slots.join(', ')}), found more`);
      break;
    }

    const slot = slots[slotIndex];
    slotMap[slot] = inputId;
    usedSlots.add(slot);
    slotIndex++;
  }

  // Check for missing slots
  for (const slot of slots) {
    if (!usedSlots.has(slot)) {
      errors.push(`Missing input for slot "${slot}"`);
    }
  }

  return { slotMap, errors };
}

// ---------------------------------------------------------------------------
// Grading pipeline: gather → evaluate → dispatch
// ---------------------------------------------------------------------------
//
// Factored so each stage can be reused outside the action flow. In
// particular, `evaluateGrader` is the seam for derived (selector-based)
// correctness: a selector can gather input values from state and call the
// same evaluation logic without dispatching anything.

/**
 * Gather values and bound APIs from each input block (synchronous — blocks
 * are in idMap; values read from the provided Redux state snapshot).
 */
export function gatherInputData(props: RuntimeProps, inputIds: StateKey[], state: any) {
  const map = props.runtime.blockRegistry;
  const inputData = inputIds.map(id => {
    const defKey = leafDefinitionKeyFromStateKey(id);
    const inst = getBlockByOLXId(props, defKey);
    if (!inst) {
      console.warn(`[runGrader] Input block "${id}" not found in idMap`);
      return { value: undefined, api: {} };
    }
    const loBlock = map[inst.tag];
    // id is already a StateKey from inferRelatedNodes
    const inputNodeInfo = getDomNodeByStateKey(props, id);

    // Use the input's own runtime (captured at render time) for correct idPrefix,
    // logEvent context, etc. Falls back to caller's runtime if nodeInfo unavailable.
    const inputProps = {
      runtime: inputNodeInfo?.runtime ?? props.runtime,
      nodeInfo: inputNodeInfo,
      id: defKey,
      kids: inst.kids || [],
      loBlock,
      fields: loBlock.fields || {},
      locals: loBlock.locals || {},
      ...inst.attributes,  // Spread OLX attributes
    };

    // Use valueSelector for uniform handling of withStatus / raw selectValue
    const { value } = valueSelector(inputProps as RuntimeProps, state, id);

    // Create bound API from locals - each function gets (props, state, id) pre-bound
    const api = loBlock.locals
      ? Object.fromEntries(
        Object.entries(loBlock.locals).map(([name, fn]: [string, Function]) => [
          name,
          (...args: any[]) => fn(inputProps, state, id, ...args)
        ])
      )
      : {};

    return { value, api };
  });

  return {
    values: inputData.map(d => d.value),
    apis: inputData.map(d => d.api),
  };
}

/**
 * Resolve gathered inputs into the parameter shape the grader function
 * expects (single / list / named slots). Pure; shared by the grading action
 * (evaluateGrader) and derived immediate-mode evaluation
 * (lib/grading/useCorrectness.ts).
 */
export function buildGraderParam(
  { slots, inputType }: { slots?: string[]; inputType?: 'single' | 'list' },
  props: RuntimeProps,
  inputIds: StateKey[],
  values: unknown[],
  apis: object[],
): { param?: GraderParams; error?: string } {
  if (slots && slots.length > 0) {
    // Dict mode: resolve inputs to named slots
    const getInputSlot = (id: StateKey) => {
      const inst = getBlockByOLXId(props, leafDefinitionKeyFromStateKey(id));
      return inst ? inst.attributes.slot as string | undefined : undefined;
    };
    const { slotMap, errors } = resolveInputSlots(slots, inputIds, getInputSlot);
    if (errors.length > 0) return { error: errors[0] };

    const inputDict: Record<string, unknown> = {};
    const inputApiDict: Record<string, object> = {};
    for (const [slot, inputId] of Object.entries(slotMap)) {
      const idx = (inputIds as string[]).indexOf(inputId);
      if (idx >= 0) {
        inputDict[slot] = values[idx];
        inputApiDict[slot] = apis[idx];
      }
    }
    return { param: { inputDict, inputApiDict } };
  }
  if (inputType === 'list') {
    return { param: { inputList: values, inputApis: apis } };
  }
  // Single input mode (default) - most graders expect a single input
  if (values.length === 0) return { error: 'No input found' };
  return { param: { input: values[0], inputApi: apis[0] } };
}

/**
 * Run a grader against gathered input values and return a normalized result.
 *
 * Never throws for authoring/compat problems — Zod mismatches, slot errors,
 * and missing inputs all come back as `correctness.invalid` results so the
 * caller can surface them to the learner. May be async (slow graders, lazy
 * engines via ensureReady).
 */
async function evaluateGrader(
  { grader, slots, inputType }: { grader: GraderFn; slots?: string[]; inputType?: 'single' | 'list' },
  props: RuntimeProps,
  targetInstance: any,
  inputIds: StateKey[],
  values: unknown[],
  apis: object[],
): Promise<{ correct: any; message: any; score?: number }> {
  const map = props.runtime.blockRegistry;
  const targetAttributes = targetInstance.attributes;

  // Check input/grader type compatibility via Zod schemas. Authoring/compat
  // problems return invalid results rather than throwing — the caller still
  // dispatches grading state so the UI updates.
  const graderInputSchema = props.loBlock.inputSchema;
  if (graderInputSchema) {
    for (const id of inputIds) {
      const inst = getBlockByOLXId(props, leafDefinitionKeyFromStateKey(id));
      if (!inst) continue;
      const inputBlock = map[inst.tag];
      if (!inputBlock.valueSchema) continue;
      if (!isZodCompatible(inputBlock.valueSchema, graderInputSchema)) {
        const graderName = props.loBlock.name;
        const inputName = inputBlock.name || inst.tag;
        return {
          correct: correctness.invalid,
          message: `${graderName} expects ${describeZodType(graderInputSchema)} input, but ${inputName} provides ${describeZodType(inputBlock.valueSchema)}.`,
        };
      }
    }
  }

  const { param, error } = buildGraderParam({ slots, inputType }, props, inputIds, values, apis);
  if (error || !param) return { correct: correctness.invalid, message: error };

  // Blueprints with slow dependencies (e.g. FormulaGrader's mathjs) declare
  // ensureReady; await it so the (synchronous) match function runs against a
  // loaded engine. The await on grader also accepts async grader functions —
  // the seam for slow graders (LLM, code-in-sandbox).
  await map[targetInstance.tag].ensureReady?.();
  return await grader({ ...props, ...targetAttributes }, param);
}

// Helper to define a grading action. This used to be called a
// "response" in OLX 1.0 terminology.
//
// Param shape the grader receives:
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
   *  grading is in flight; the final result overwrites it when the grader
   *  resolves. UI reads via useCorrectness/selectors, so both phases are
   *  ordinary field writes. */
  slow?: boolean;
}) {
  // Props reconstruction: We have full props from the action source (grader).
  // For inputs and other related blocks, we reconstruct complete props with their
  // blueprint and nodeInfo. The runtime context is shared from the source props.

  const action = async ({ targetId, targetInstance, props }) => {
    // targetId is already a StateKey from inferRelatedNodes (via executeNodeActions)
    const targetNodeInfo = getDomNodeByStateKey(props, targetId);
    const targetAttributes = targetInstance.attributes;

    const inputIds = inferRelatedNodes(
      { ...props, nodeInfo: targetNodeInfo },
      {
        selector: n => n.loBlock && isInput(n.loBlock),
        infer,
        targets: targetAttributes?.target,
      }
    );

    const state = props.runtime.store.getState();
    const { values, apis } = gatherInputData(props, inputIds, state);
    const writeOpts = { stateKey: targetId as StateKey };

    // Re-entrancy guard: a submission is already being graded (the button
    // disables on 'submitted', but a fast double-click can race the event
    // queue). Skip rather than launch a duplicate grading call.
    if (slow && state.application_state?.component?.[targetId]?.correct === correctness.submitted) {
      return undefined;
    }

    // Capture what is being graded (shown by the UI during slow grading and
    // for changed-since-submission indicators afterwards).
    updateField(props, commonFields.lastSubmission, values, writeOpts);

    if (slow) {
      // Phase 1 of two-phase grading: mark the submission pending before
      // awaiting the (slow) grader; inputs lock via useInputReadOnly. If the
      // grader ultimately returns unsubmitted/invalid (e.g. empty input),
      // the final write below simply overwrites the transient pending state.
      updateField(props, commonFields.correct, correctness.submitted, writeOpts);
    }

    let correct: any, message: any, score: number | undefined;
    try {
      ({ correct, message, score } = await evaluateGrader(
        { grader, slots, inputType }, props, targetInstance, inputIds, values, apis
      ));
    } catch (error: any) {
      // An unexpected failure (rejected ensureReady, grader bug, data
      // access) must not strand the pending 'submitted' state — inputs lock
      // while it persists (useInputReadOnly). Terminal invalid: the answer
      // was never judged and the attempt isn't counted.
      console.error('[grader] evaluation failed:', error);
      correct = correctness.invalid;
      message = `Grading failed: ${error?.message ?? error}. Please try again.`;
    }

    const correctnessValue = normalizeCorrectness(correct);

    // Only increment submitCount for real submissions (not blank/invalid).
    // Re-read state here: the grader may have awaited (slow grader, lazy
    // engine), and the pre-evaluation snapshot could hold a stale count.
    const currentState = props.runtime.store.getState()
      .application_state?.component?.[targetId] || {};
    const isRealSubmission = correctnessValue !== correctness.unsubmitted &&
                             correctnessValue !== correctness.invalid;
    const submitCount = (currentState.submitCount || 0) + (isRealSubmission ? 1 : 0);

    // Per-field dispatch: each grader field is its own CRDT write with proper
    // conflict-resolution metadata. (Replaces the legacy compound
    // UPDATE_CORRECT event, which the reducer still accepts for old
    // recordings — see store.ts.) `correct` goes last so anything keying off
    // it observes the other fields already settled.
    updateField(props, commonFields.message, message, writeOpts);
    updateField(props, commonFields.score, score, writeOpts);
    updateField(props, commonFields.submitCount, submitCount, writeOpts);
    updateField(props, commonFields.correct, correctnessValue, writeOpts);
    return correct;
  };

  // Everything the helper contributes is packaged as a `graderMixin` layer.
  // createBlock's composition pass merges this layer into the final blueprint,
  // so callers get `isGrader`, the grading action, `slots`, `getDisplayAnswer`,
  // and the `answer`/`displayAnswer`/`target` attributes without declaring them
  // at the top level themselves.
  return {
    graderMixin: {
      action,
      isGrader: true,
      // One descriptor for everything the grading pipeline needs outside the
      // action itself (derived immediate-mode evaluation, slow-grader
      // detection). A blueprint with isGrader but NO `grading` descriptor is
      // a metagrader (CapaProblem) — its state derives from child graders.
      grading: { fn: grader, inputType, slots, slow },
      slots,  // Named slots for multi-input graders
      // Default display answer - can be overridden in block definition
      getDisplayAnswer: (props) => props.displayAnswer ?? props.answer,
      attributes: graderAttributes,
    },
  };
}

export async function executeNodeActions(props: RuntimeProps) {
  const ids = inferRelatedNodes(props, {
    selector: n => isAction(n.loBlock),
    infer: props.infer,
    targets: props.target
  });
  const map = props.runtime.blockRegistry;
  for (const targetId of ids) {
    const targetDefKey = leafDefinitionKeyFromStateKey(targetId);
    const targetInstance = getBlockByOLXId(props, targetDefKey);
    if (!targetInstance) {
      console.warn(`[executeNodeActions] Action block "${targetId}" not found in Redux`);
      continue;
    }
    const targetBlueprint = map[targetInstance.tag];
    if (!targetBlueprint?.action) {
      console.warn(`[executeNodeActions] Block "${targetId}" (${targetInstance.tag}) has no action method`);
      continue;
    }

    // Find the action's OlxDomNode
    // targetId is already a StateKey from inferRelatedNodes
    const actionNodeInfo = getDomNodeByStateKey(props, targetId);

    if (!actionNodeInfo) {
      throw new Error(`Action ${targetId} not found in dynamic DOM tree - this indicates a bug in the rendering system`);
    }

    const actionProps = propsFromNode(actionNodeInfo);

    await targetBlueprint.action({
      targetId,
      targetInstance,
      targetBlueprint,
      props: actionProps
    });
  }
}
