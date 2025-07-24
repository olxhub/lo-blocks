// src/lib/blocks/actions.jsx
import { inferRelatedNodes, getAllNodes } from './olxdom';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';
import * as lo_event from 'lo_event';

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

  const action = ({ targetId, targetInstance, props }) => {
    const targetNodeInfo = getNodeById(props, targetId);
    const targetAttributes = targetInstance.attributes;

    const inputIds = inferRelatedNodes(
      { ...props, nodeInfo: targetNodeInfo },
      {
        selector: n => n.blueprint && isInput(n.blueprint),
        infer,
        targets: targetAttributes?.targets,
      }
    );

    // TODO: We shouldn't be mucking about inside reduxLogger manually.
    // selectors do a lot of this.
    const state = reduxLogger.store.getState()?.application_state?.component ?? {};
    const map = props.componentMap;
    const values = inputIds.map(id => {
      const inst = props.idMap[id];
      const blueprint = map[inst.tag];
      // TODO: Props should always be first
      const inputNodeInfo = getNodeById(props, id);
      const inputProps = { ...props, nodeInfo: inputNodeInfo, id };
      return blueprint.getValue(state, id, inputProps);
    });

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
    */

    const param = values.length === 1
      ? { input: values[0], inputs: values }
      : { inputs: values };
    const { correct, message } = grader(
      { ...props, ...targetAttributes },
      param
    );
    console.log(grader(
      { ...props, ...targetAttributes },
      param
    ));
    // TODO: Add number of attempts
    // TODO Should we copy:
    // https://edx.readthedocs.io/projects/devdata/en/stable/internal_data_formats/tracking_logs/student_event_types.html#problem-check
    lo_event.logEvent('UPDATE_CORRECT', {
      id: targetId,
      correct,
      message,
      answers: values  // Key-value pair?
    });
    return correct;
  };

  return {
    action,
    isGrader: true
  };
}

export function executeNodeActions(props) {
  const ids = inferRelatedNodes( props, {
    selector: n => isAction(n.blueprint),
    infer: props.infer,
    targets: props.targets
  });
  const map = props.componentMap;
  ids.forEach(targetId => {
    const targetInstance = props.idMap[targetId];
    const targetBlueprint = map[targetInstance.tag];
    targetBlueprint.action({
      targetId,
      targetInstance,
      targetBlueprint,
      props
    });
  });
}
