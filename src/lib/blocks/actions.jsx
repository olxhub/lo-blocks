import { inferRelatedNodes } from './olxdom';
import { COMPONENT_MAP } from '@/components/componentMap';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';

export function action({ action }) {
  return { action };
}

export function input({ getValue }) {
  return { getValue };
}

export function response({ grader, infer = true, targets } = {}) {
  const action = ({ targetInstance, props }) => {
    const ids = inferRelatedNodes(
      { ...props, nodeInfo: targetInstance.nodeInfo },
      {
        selector: n => n.spec && n.spec.isInput,
        infer,
        targets,
      }
    );

    const state = reduxLogger.store.getState().component_state;
    const values = ids.map(id => {
      const inst = props.idMap[id];
      const spec = COMPONENT_MAP[inst.tag];
      return spec.getValue ? spec.getValue(state, id) : undefined;
    });

    return grader(props, values.length === 1 ? values[0] : values);
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
