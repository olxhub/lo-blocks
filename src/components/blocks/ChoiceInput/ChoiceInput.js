// src/components/blocks/ChoiceInput/ChoiceInput.js
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _Noop from '../_Noop';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';

export const fields = state.fields(['value']);

const ChoiceInput = core({
  ...parsers.blocks,
  name: 'ChoiceInput',
  component: _Noop,
  fields,
  getValue: (reduxState, id, props = {}) => {
    const value = reduxState?.[id]?.value ?? '';
    let choices = [];
    if (props.nodeInfo) {
      const ids = inferRelatedNodes(props, {
        selector: n => n.node.tag === 'Key' || n.node.tag === 'Distractor',
        infer: ['kids'],
        targets: props.targets
      });
      choices = ids.map(cid => {
        const inst = props.idMap?.[cid];
        return { id: cid, tag: inst?.tag };
      });
    }
    return { value, choices };
  }
});

export default ChoiceInput;
