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

type GraderFn = (props: RuntimeProps, params: { input?: unknown; inputs?: unknown[]; inputApi?: object; inputApis?: object[] }) => { correct: unknown; message: unknown; score?: number };

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
  return { getValue };
}

// TODO: Duck-typing via getValue is a mistake. Should check loBlock.isInput
// and populate that explicitly in factory.tsx from blueprint.isInput.
export function isInput(loBlock) {
  return typeof loBlock?.getValue === "function";
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

// Helper to define a grading action. This used to be called a
// "response" in OLX 1.0 terminology.
export function grader({ grader, infer = true }: { grader: GraderFn; infer?: boolean }) {
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

    /*
      TODO: What should we pass into the grader?

      Worth reviewing:
      https://docs.openedx.org/en/latest/educators/references/course_development/exercise_tools/guide_custom_python_problem.html
      https://docs.openedx.org/en/latest/educators/how-tos/course_development/exercise_tools/create_custom_python_problem.html
      https://docs.openedx.org/en/latest/educators/references/course_development/exercise_tools/custom_javascript.html

      An open question is whether / how we name inputs. In many cases,
      for multiple, we'll want a dictionary.

      Another question is how to keep the most common case (one input)
      simple, while allowing multiple. A basic value=answer is much
      nicer. values[0] is especially imperfect, since it suggests
      asserting the length is one.

      And we don't like values[0], values[1] as much as e.g. x, y.

      But if the grader expects a list, a list of length 1 should be okay.

      The inputApi/inputApis provide access to the input's locals functions,
      allowing graders to query additional context (e.g., ChoiceInput.getChoices()).
    */

    const param = values.length === 1
      ? { input: values[0], inputs: values, inputApi: apis[0], inputApis: apis }
      : { inputs: values, inputApis: apis };
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
