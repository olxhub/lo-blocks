// packages/shared/components/blocks/layout/Collapsible/Collapsible.ts

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { decodedFieldSelector } from '@/lib/state';
import { shallowEqual } from 'react-redux';

export const fields = state.fields(['expanded']);

const Collapsible = dev({
  ...parsers.blocks(),
  name: 'Collapsible',
  description: 'Collapsible section with expandable/collapsible content',
  fields: fields,
  selectors: {
    value: {
      select: (state, props, _stateKey) => {
        const expanded = decodedFieldSelector(state, props, fields.expanded, { fallback: false });
        return { expanded };
      },
      // Fresh object per evaluation — subscribers gate on content.
      equality: shallowEqual,
    },
  },
  attributes: z.object({
    label: z.string().optional().describe('Header text for the collapsible section (alias for title)'),
  }).strict(),
});

export default Collapsible;
