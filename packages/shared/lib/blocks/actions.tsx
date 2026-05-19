// src/lib/blocks/actions.tsx
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
import { correctness } from './correctness';
import { scopedStateKeyForBlock } from '../types/id-grammar';
import { getBlockByOLXId } from './getBlockByOLXId';
import { valueSelector } from '@/lib/state/redux';
import { isZodCompatible, describeZodType } from './zodCompat';
import { inputAttributes, graderAttributes } from './attributeSchemas';
import type { RuntimeProps, DefinitionKey, DefinitionRef, LoBlock, ValueSelectorFn } from '@/lib/types';
import type { Store } from 'redux';

// Grader parameter types - each grader receives exactly one of these
export type SingleParam = { input: unknown; inputApi: object };
export type ListParam = { inputList: unknown[]; inputApis: object[] };
export type DictParam = { inputDict: Record<string, unknown>; inputApiDict: Record<string, object> };
export type GraderParams = SingleParam | ListParam | DictParam;

type GraderFn = (props: RuntimeProps, params: GraderParams) => { correct: unknown; message: unknown; score?: number };

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
  inputIds: DefinitionKey[],
  getInputSlot: (id: DefinitionKey) => string | undefined
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

// Helper to define a grading action. This used to be called a
// "response" in OLX 1.0 terminology.
//
// Param shape the grader receives:
// - slots defined: { inputDict, inputApiDict } - named slots
// - inputType: 'list': { inputList, inputApis } - array of inputs
// - default (single): { input, inputApi } - one input (most common)
export function grader({ grader, infer = true, slots, inputType }: {
  grader: GraderFn;
  infer?: boolean;
  slots?: string[];
  inputType?: 'single' | 'list';
}) {
  // Props reconstruction: We have full props from the action source (grader).
  // For inputs and other related blocks, we reconstruct complete props with their
  // blueprint and nodeInfo. The runtime context is shared from the source props.

  const action = async ({ targetId, targetInstance, props }) => {
    // DefinitionKey → StateKey (applies runtime.idPrefix for DynamicList scoping)
    const targetNodeInfo = getDomNodeByStateKey(props, scopedStateKeyForBlock({ id: targetId, idPrefix: props.runtime?.idPrefix }));
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
    const map = props.runtime.blockRegistry;

    // Gather values and APIs from each input (synchronous - blocks are in idMap)
    const inputData = inputIds.map(id => {
      const inst = getBlockByOLXId(props, id);
      if (!inst) {
        console.warn(`[runGrader] Input block "${id}" not found in idMap`);
        return { value: undefined, api: {} };
      }
      const loBlock = map[inst.tag];
      // DefinitionKey → StateKey (applies runtime.idPrefix for DynamicList scoping)
      const inputStateKey = scopedStateKeyForBlock({ id, idPrefix: props.runtime?.idPrefix });
      const inputNodeInfo = getDomNodeByStateKey(props, inputStateKey);

      // Use the input's own runtime (captured at render time) for correct idPrefix,
      // logEvent context, etc. Falls back to caller's runtime if nodeInfo unavailable.
      const inputProps = {
        runtime: inputNodeInfo?.runtime ?? props.runtime,
        nodeInfo: inputNodeInfo,
        id,
        kids: inst.kids || [],
        loBlock,
        fields: loBlock.fields || {},
        locals: loBlock.locals || {},
        ...inst.attributes,  // Spread OLX attributes
      };

      // Use valueSelector for uniform handling of withStatus / raw selectValue
      const { value } = valueSelector(inputProps as RuntimeProps, state, inputStateKey);

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

    const values = inputData.map(d => d.value);
    const apis = inputData.map(d => d.api);

    // Check input/grader type compatibility via Zod schemas.
    // On mismatch, set result directly instead of returning early — we still
    // need to dispatch UPDATE_CORRECT so the UI updates (executeNodeActions
    // ignores return values).
    let zodMismatchResult: { correct: string; message: string; score?: number } | null = null;
    const graderInputSchema = props.loBlock?.inputSchema;
    if (graderInputSchema) {
      for (const id of inputIds) {
        const inst = getBlockByOLXId(props, id);
        if (!inst) continue;
        const inputBlock = map[inst.tag];
        if (!inputBlock?.valueSchema) continue;
        if (!isZodCompatible(inputBlock.valueSchema, graderInputSchema)) {
          const graderName = props.loBlock?.name || 'Grader';
          const inputName = inputBlock.name || inst.tag;
          zodMismatchResult = {
            correct: correctness.invalid,
            message: `${graderName} expects ${describeZodType(graderInputSchema)} input, but ${inputName} provides ${describeZodType(inputBlock.valueSchema)}.`,
          };
          break;
        }
      }
    }

    // Build grader parameters and run grader (skip if Zod already caught a mismatch)
    let correct: any, message: any, score: any;
    if (zodMismatchResult) {
      ({ correct, message, score } = zodMismatchResult);
    } else {
      let param: GraderParams | undefined;

      if (slots && slots.length > 0) {
        // Dict mode: resolve inputs to named slots
        const getInputSlot = (id: DefinitionKey) => {
          const inst = getBlockByOLXId(props, id);
          return inst?.attributes?.slot as string | undefined;
        };

        const { slotMap, errors } = resolveInputSlots(slots, inputIds, getInputSlot);

        if (errors.length > 0) {
          // Slot resolution failed — fall through to dispatch so UI updates
          correct = correctness.invalid;
          message = errors[0];
        } else {
          // Build slot→value and slot→api maps
          const inputDict: Record<string, unknown> = {};
          const inputApiDict: Record<string, object> = {};

          for (const [slot, inputId] of Object.entries(slotMap)) {
            const idx = (inputIds as string[]).indexOf(inputId);
            if (idx >= 0) {
              inputDict[slot] = values[idx];
              inputApiDict[slot] = apis[idx];
            }
          }

          param = { inputDict, inputApiDict };
        }
      } else if (inputType === 'list') {
        // List mode - explicitly requested
        param = { inputList: values, inputApis: apis };
      } else {
        // Single input mode (default when no slots specified)
        // Most graders expect a single input
        if (values.length === 0) {
          // No input — fall through to dispatch so UI updates
          correct = correctness.invalid;
          message = 'No input found';
        } else {
          param = { input: values[0], inputApi: apis[0] };
        }
      }
      if (param) {
        ({ correct, message, score } = grader(
          { ...props, ...targetAttributes },
          param
        ));
      }
    }

    // Convert boolean correct to correctness enum for display
    const correctnessValue = correct === true ? correctness.correct :
      correct === false ? correctness.incorrect :
        correct; // In case it's already a correctness value

    // Scope the target ID (applies runtime.idPrefix for list/repeated contexts)
    const scopedTargetId = scopedStateKeyForBlock({ id: targetId, idPrefix: props.runtime?.idPrefix });

    // Get current submitCount — only increment for real submissions (not blank/invalid)
    const currentState = state.application_state?.component?.[scopedTargetId] || {};
    const isRealSubmission = correctnessValue !== correctness.unsubmitted &&
                             correctnessValue !== correctness.invalid;
    const submitCount = (currentState.submitCount || 0) + (isRealSubmission ? 1 : 0);

    // HACK: This sends a compound event with multiple data properties, but only
    // `correct` is a declared CRDT field. The extras (submitCount, score, message,
    // answers) are spread as plain values in the reducer, gated by `correct`'s LWW
    // timestamp for consistency. This should be replaced with a CRDT dictionary
    // (or per-field events) so all properties get proper conflict resolution.
    const logEvent = props.runtime.logEvent;
    logEvent('UPDATE_CORRECT', {
      id: scopedTargetId,
      correct: correctnessValue,
      message,
      score,
      submitCount,
      lastSubmission: values
    });
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
    const targetInstance = getBlockByOLXId(props, targetId);
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
    // DefinitionKey → StateKey (applies runtime.idPrefix for DynamicList scoping)
    const actionNodeInfo = getDomNodeByStateKey(props, scopedStateKeyForBlock({ id: targetId, idPrefix: props.runtime?.idPrefix }));

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
