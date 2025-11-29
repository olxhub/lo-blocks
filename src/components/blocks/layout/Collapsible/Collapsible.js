// src/components/blocks/layout/Collapsible/Collapsible.js

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import _Collapsible from './_Collapsible';

export const fields = state.fields(['expanded']);

const Collapsible = dev({
  ...parsers.blocks(),
  name: 'Collapsible',
  description: 'Collapsible section with expandable/collapsible content',
  component: _Collapsible,
  fields: fields,
  getValue: (props, state, id) => {
    const expanded = fieldSelector(state, props, fieldByName('expanded'), { fallback: false, id });
    return { expanded };
  }
});

export default Collapsible;
