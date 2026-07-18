// packages/shared/components/blocks/layout/Navigator/Navigator.ts
//
// PROTOTYPE: Two-pane navigator with list on left and detail on right.
// Uses YAML text content for item data, references blocks for preview/detail templates.
//

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { decodedFieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes, z_stateRef } from '@/lib/blocks/attributeSchemas';

export const fields = state.fields([
  'selectedItem',     // Currently selected item ID
  'searchQuery',      // Search/filter text
  'viewMode'          // Optional view mode state
]);

const Navigator = dev({
  ...parsers.text(),
  name: 'Navigator',
  description: 'Two-pane navigator with configurable preview and detail templates',
  fields: fields,
  selectors: {
    value: (state, props, _stateKey) => {
      const selectedItem = decodedFieldSelector(state, props, fields.selectedItem, { fallback: null });
      const searchQuery = decodedFieldSelector(state, props, fields.searchQuery, { fallback: '' });
      const viewMode = decodedFieldSelector(state, props, fields.viewMode, { fallback: 'default' });
      return { selectedItem, searchQuery, viewMode };
    },
  },
  attributes: srcAttributes.extend({
    preview: z_stateRef.optional().describe('ID of block to use as preview template'),
    detail: z_stateRef.optional().describe('ID of block to use as detail template'),
    searchable: z.enum(['true', 'false']).optional().describe('Enable search/filter functionality'),
  }),
});

export default Navigator;
