// src/components/blocks/Ref.jsx
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { fieldByName, fieldSelector } from '@/lib/state';
import _Ref from './_Ref';

const Ref = core({
  ...parsers.ignore(),
  name: 'Ref',
  component: _Ref,
  description: 'Render the value of another block\'s field.',
  getValue: (props, state, id) => { // TODO: Untested
    const targetNode = props.idMap[id];
    const target = targetNode?.attributes?.target || '';
    const [sourceId, fieldName = 'value'] = target.split('.');
    const info = fieldByName(fieldName);
    if (!info) return undefined;
    return fieldSelector(state, { ...props, id: sourceId }, info, { fallback: '' });
  }
});

export default Ref;
