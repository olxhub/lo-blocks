import { inferRelatedNodes, getAllNodes } from './olxdom';
import { COMPONENT_MAP } from '@/components/componentMap';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';
import * as lo_event from 'lo_event';

export function action({ action }) {
  return { action };
}

export function input({ getValue }) {
  return { getValue };
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

// TODO: Should we name this grader, and then have an Open edX /
// LON-CAPA tranlation layer? Response makes little sense.
export function response({ grader, infer = true } = {}) {
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
        selector: n => n.spec && n.spec.isInput,
        infer,
        targets: targetAttributes?.targets,
      }
    );

    const state = reduxLogger.store.getState().application_state.component_state;
    const values = inputIds.map(id => {
      const inst = props.idMap[id];
      const spec = COMPONENT_MAP[inst.tag];
      return spec.getValue ? spec.getValue(state, id) : undefined;
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
      simple, while allowing multiple.
    */

    const result = grader(
      {...props, ...targetAttributes },
      values.length === 1 ? values[0] : values
    );
    lo_event.logEvent('UPDATE_CORRECTNESS', {
      id: targetId,
      correctness: result,
    });
    return result;
  };

  return { action };
}

export function executeNodeActions(props) {
  const ids = inferRelatedNodes( props, {
    selector: n => typeof n.spec?.action === 'function',
    infer: props.infer,
    targets: props.targets
  });
  ids.forEach(targetId => {
    const targetInstance = props.idMap[targetId];
    const targetSpec = COMPONENT_MAP[targetInstance.tag];
    targetSpec.action({
      targetId,
      targetInstance,
      targetSpec,
      props
    });
  });
}
