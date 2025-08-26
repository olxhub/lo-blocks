// src/components/blocks/ChoiceInput/ChoiceInput.js
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _Noop from '../_Noop';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';

export const fields = state.fields(['value']);

const ChoiceInput = core({
  ...parsers.blocks(),
  name: 'ChoiceInput',
  description: 'Multiple choice input collecting student selections from Key/Distractor options',
  component: _Noop,
  fields,
  getValue: (reduxState, id, props = {}) => {
    const value = reduxState?.[id]?.value ?? '';
    const ids = inferRelatedNodes(props, {
      selector: n => n.blueprint.name === 'Key' || n.blueprint.name === 'Distractor',
      infer: ['kids'],
      targets: props.targets
    });
    const choices = ids.map(cid => {
      const inst = props.idMap?.[cid];
      let feedback;
      const fbKid = (inst?.kids || []).find(
        k => k.type === 'block' && props.idMap?.[k.id].tag === 'Feedback'
      );
      if (fbKid && Array.isArray(props.idMap?.[fbKid.id].kids)) {
        feedback = props.idMap?.[fbKid.id].kids
          .map(k => {
            if (typeof k === 'string') return k;
            if (k && typeof k === 'object' && k.type === 'text') return k.text;
            return '';
          })
          .join('')
          .trim();
      }
      return { id: cid, tag: inst?.tag, feedback };
    });
    return { value, choices };
  }
});

export default ChoiceInput;
