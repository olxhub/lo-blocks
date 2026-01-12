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
import { inferRelatedNodes, getAllNodes } from './olxdom';
import * as lo_event from 'lo_event';
import { correctness } from './correctness';
import { refToReduxKey } from './idResolver';
import { getBlockByOLXId } from './getBlockByOLXId';
import type { RuntimeProps } from '@/lib/types';
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
 * getValue Specification (NOT YET IMPLEMENTED)
 * =============================================
 * Inputs and graders should declare compatible value types so they can be
 * composed safely. For example:
 * - TextInput exports `string`
 * - NumericInput exports `number`
 * - ChoiceInput exports `string` (the selected choice value)
 * - CheckboxInput exports `string[]` (array of selected values)
 *
 * Beyond primitive types, values often carry pedagogical semantics:
 * - A string input might be specific to e.g. student name or a biology report
 * - A numeric input might only support integers
 * - A grader might expect a narrower type than 'string'
 *
 * So we want a full type system, either that we invent or better that
 * we bring in. This is a design project.
 *
 * Future design should allow:
 * 1. Blocks to declare their value type in the blueprint
 * 2. Graders to declare which input types they accept
 * 3. Parse-time or render-time validation that inputs/graders are compatible
 * 4. Editor tooling to suggest compatible graders for a given input
 *
 * This enables a plug-and-play model where course authors can mix inputs
 * and graders without understanding implementation details.
 */
export function input({ getValue }) {
  return { getValue, isInput: true };
}

// Input blocks should set isInput: true on the blueprint.
// The blocks.input() mixin does this automatically.
// For legacy compatibility, we also check for getValue presence.
export function isInput(loBlock) {
  return loBlock?.isInput || typeof loBlock?.getValue === "function";
}

export function isMatch(loBlock) {
  return typeof loBlock?.locals?.match === 'function';
}

// This does a full tree search, which is not performant. Probably doesn't matter
// right now, but in the future, it may.
//
// TODO: Make more efficient? Does it matter?
function getNodeById(props, id) {
  const nodes = getAllNodes(
    props.nodeInfo,
    { selector: (n) => n?.node?.id == id }
  );
  return nodes[0]; // TODO: Error handling?
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
  inputIds: string[],
  getInputSlot: (id: string) => string | undefined
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
  // TODO: Throughout here, we mix up props in ways which should be cleaner.
  //
  // We only have the props for the action source. For the rest, we
  // have IDs. The hack is we mix in what we need from the input or
  // the grader, but take the rest from the source.
  //
  // This is scaffolding and should be fixed on a future pass.

  const action = async ({ targetId, targetInstance, props }) => {
    const targetNodeInfo = getNodeById(props, targetId);
    const targetAttributes = targetInstance.attributes;

    const inputIds = inferRelatedNodes(
      { ...props, nodeInfo: targetNodeInfo },
      {
        selector: n => n.loBlock && isInput(n.loBlock),
        infer,
        targets: targetAttributes?.target,
      }
    );

    const state = props.store.getState();
    const map = props.blockRegistry;

    // Gather values and APIs from each input (synchronous - blocks are in idMap)
    const inputData = inputIds.map(id => {
      const inst = getBlockByOLXId(props, id);
      if (!inst) {
        console.warn(`[runGrader] Input block "${id}" not found in idMap`);
        return { value: undefined, api: {} };
      }
      const loBlock = map[inst.tag];
      const inputNodeInfo = getNodeById(props, id);
      // HACK: We don't have the input's full props, so copy over fields that downstream code needs
      const inputProps = { ...props, nodeInfo: inputNodeInfo, id, target: inst.attributes?.target, kids: inst.kids };

      const value = loBlock.getValue(inputProps, state, id);

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

    // Build grader parameters based on declared input type
    let param: GraderParams;

    if (slots && slots.length > 0) {
      // Dict mode: resolve inputs to named slots
      const getInputSlot = (id: string) => {
        const inst = getBlockByOLXId(props, id);
        return inst?.attributes?.slot as string | undefined;
      };

      const { slotMap, errors } = resolveInputSlots(slots, inputIds as string[], getInputSlot);

      if (errors.length > 0) {
        // Slot resolution failed - return invalid with error message
        return {
          correct: correctness.invalid,
          message: errors[0],
        };
      }

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
    } else if (inputType === 'list') {
      // List mode - explicitly requested
      param = { inputList: values, inputApis: apis };
    } else {
      // Single input mode (default when no slots specified)
      // Most graders expect a single input
      if (values.length === 0) {
        return {
          correct: correctness.invalid,
          message: 'No input found',
        };
      }
      param = { input: values[0], inputApi: apis[0] };
    }
    const { correct, message, score } = grader(
      { ...props, ...targetAttributes },
      param
    );

    // Convert boolean correct to correctness enum for display
    const correctnessValue = correct === true ? correctness.correct :
      correct === false ? correctness.incorrect :
        correct; // In case it's already a correctness value

    // Use refToReduxKey to get scoped ID (applies idPrefix for list/repeated contexts)
    const scopedTargetId = refToReduxKey({ ...props, id: targetId });

    // Get current submitCount and increment it for UI flash feedback
    const currentState = state.application_state?.component?.[scopedTargetId] || {};
    const submitCount = (currentState.submitCount || 0) + 1;

    // Use props.logEvent if available (respects replay mode), fallback to lo_event.logEvent
    const logEvent = props.logEvent ?? lo_event.logEvent;
    logEvent('UPDATE_CORRECT', {
      id: scopedTargetId,
      correct: correctnessValue,
      message,
      score,
      submitCount,
      answers: values
    });
    return correct;
  };

  return {
    action,
    isGrader: true,
    slots,  // Named slots for multi-input graders
    // Default display answer - can be overridden in block definition
    getDisplayAnswer: (props) => props.displayAnswer ?? props.answer,
  };
}

export async function executeNodeActions(props: RuntimeProps) {
  const ids = inferRelatedNodes(props, {
    selector: n => isAction(n.loBlock),
    infer: props.infer,
    targets: props.target
  });
  const map = props.blockRegistry;
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

    // Find the action's nodeInfo in the dynamic OLX DOM tree
    // Actions should already be rendered as part of the tree, so we need to find them
    const actionNodeInfo = getNodeById(props, targetId);

    if (!actionNodeInfo) {
      throw new Error(`Action ${targetId} not found in dynamic DOM tree - this indicates a bug in the rendering system`);
    }

    // Create proper props for the action component
    // Match the props structure that render.jsx creates for normal components
    const actionProps = {
      // Copy essential props from original context
      olxJsonSources: props.olxJsonSources,
      blockRegistry: props.blockRegistry,
      idPrefix: props.idPrefix,  // Preserve prefix so actions update scoped state
      store: props.store,        // Redux store for state access
      logEvent: props.logEvent,  // Event logging (no-op during replay)

      // Target-specific props (like render.jsx does)
      ...targetInstance.attributes,        // OLX attributes from target action
      kids: targetInstance.kids || [],     // Children of the action block
      id: targetId,
      loBlock: targetBlueprint,
      fields: targetBlueprint.fields || {}, // Fields are now directly { fieldName: FieldInfo }
      nodeInfo: actionNodeInfo,
    };

    await targetBlueprint.action({
      targetId,
      targetInstance,
      targetBlueprint,
      props: actionProps
    });
  }
}
