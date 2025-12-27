// src/lib/blocks/actions.jsx
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
import { inferRelatedNodes, getAllNodes } from './olxdom';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';
import * as lo_event from 'lo_event';
import { CORRECTNESS } from './correctness';
import { reduxId } from './idResolver';
import { getBlockByOLXId } from './index';

// Mix-in to make a block an action
export function action({ action }) {
  return { action };
}

export function isAction(blueprint) {
  return typeof blueprint?.action === "function";
}

// Mix-in to make a block spec an input
export function input({ getValue }) {
  return { getValue };
}

export function isInput(blueprint) {
  return typeof blueprint?.getValue === "function";
}

export function isMatch(blueprint) {
  return typeof blueprint?.locals?.match === 'function';
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
export function grader({ grader, infer = true } = {}) {
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
        selector: n => n.blueprint && isInput(n.blueprint),
        infer,
        targets: targetAttributes?.target,
      }
    );

    const state = reduxLogger.store.getState();
    const map = props.componentMap;

    // Gather values and APIs from each input
    const inputData = await Promise.all(inputIds.map(async id => {
      const inst = await getBlockByOLXId(props, id);
      const blueprint = map[inst.tag];
      const inputNodeInfo = getNodeById(props, id);
      // HACK: We don't have the input's full props, so copy over fields that downstream code needs
      const inputProps = { ...props, nodeInfo: inputNodeInfo, id, target: inst.attributes?.target, kids: inst.kids };

      const value = blueprint.getValue(inputProps, state, id);

      // Create bound API from locals - each function gets (props, state, id) pre-bound
      const api = blueprint.locals
        ? Object.fromEntries(
            Object.entries(blueprint.locals).map(([name, fn]) => [
              name,
              (...args) => fn(inputProps, state, id, ...args)
            ])
          )
        : {};

      return { value, api };
    }));

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

    // Convert boolean correct to CORRECTNESS enum for display
    const correctness = correct === true ? CORRECTNESS.CORRECT :
                       correct === false ? CORRECTNESS.INCORRECT :
                       correct; // In case it's already a CORRECTNESS value

    // Use reduxId to get scoped ID (applies idPrefix for list/repeated contexts)
    const scopedTargetId = reduxId({ ...props, id: targetId });

    // Get current submitCount and increment it for UI flash feedback
    const currentState = state.application_state?.component?.[scopedTargetId] || {};
    const submitCount = (currentState.submitCount || 0) + 1;

    lo_event.logEvent('UPDATE_CORRECT', {
      id: scopedTargetId,
      correct: correctness,
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

export async function executeNodeActions(props) {
  const ids = inferRelatedNodes( props, {
    selector: n => isAction(n.blueprint),
    infer: props.infer,
    targets: props.target
  });
  const map = props.componentMap;
  for (const targetId of ids) {
    const targetInstance = await getBlockByOLXId(props, targetId);
    const targetBlueprint = map[targetInstance.tag];

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
      idMap: props.idMap,
      componentMap: props.componentMap,
      idPrefix: props.idPrefix,  // Preserve prefix so actions update scoped state

      // Target-specific props (like render.jsx does)
      ...targetInstance.attributes,        // OLX attributes from target action
      kids: targetInstance.kids || [],     // Children of the action block
      id: targetId,
      blueprint: targetBlueprint,
      fields: targetBlueprint.fields?.fieldInfoByField || {}, // Transformed fields like render.jsx:127
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
