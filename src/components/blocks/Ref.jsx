// src/components/blocks/Ref.jsx
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { fieldByName, selectFromStore } from '@/lib/state';
import _Ref from './_Ref';

const Ref = core({
  ...parsers.ignore,
  name: 'Ref',
  component: _Ref,
  description: 'Render the value of another block\'s field.',
  getValue: (_state, _id, { target = '' } = {}) => { // TODO: Untested
    const [sourceId, fieldName = 'value'] = target.split('.');
    const info = fieldByName(fieldName);
    if (!info) return undefined;
    return selectFromStore(info, { id: sourceId, fallback: '' });
  }
});

export default Ref;
