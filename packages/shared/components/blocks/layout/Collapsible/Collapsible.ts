// src/components/blocks/layout/Collapsible/Collapsible.js

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Collapsible from './_Collapsible';

export const fields = state.fields(['expanded']);

const Collapsible = dev({
  ...parsers.blocks(),
  name: 'Collapsible',
  description: 'Collapsible section with expandable/collapsible content',
  component: _Collapsible,
  fields: fields,
  // as any: See selectValue spec in lib/blocks/actions.tsx
  selectValue: ((props, state, _reduxKey) => {
    const expanded = fieldSelector(state, props, fields.expanded, { fallback: false });
    return { expanded };
  }) as any,
  attributes: baseAttributes.extend({
    label: z.string().optional().describe('Header text for the collapsible section (alias for title)'),
  }),
});

export default Collapsible;
