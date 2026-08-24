// packages/shared/components/blocks/layout/Tabs/Tabs.ts

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import { printModes } from '@/lib/blocks/attributeSchemas';
import * as parsers from '@/lib/content/parsers';
import { shallowEqual } from 'react-redux';

// Authored setters carry strings; tab indexes are integers.
export const fields = state.fields([{ name: 'activeTab', schema: z.coerce.number().int() }]);

const Tabs = dev({
  ...parsers.blocks(),
  name: 'Tabs',
  description: 'Tabbed interface component with multiple content panels',
  fields: fields,
  attributes: z.object({
    print: z.enum([...printModes, 'no-chrome']).optional()
      .describe('Print/PDF output: "false" omits the block; "no-chrome" omits the tab header; omitted or "true" prints both'),
  }).strict(),
  allowOverrides: ['print'],
  selectors: {
    value: {
      select: (state, props, _stateKey) => {
        const activeTab = fieldSelector(state, props, fields.activeTab, { fallback: 0 });
        return { activeTab };
      },
      // Fresh object per evaluation — subscribers gate on content.
      equality: shallowEqual,
    },
  },
});

export default Tabs;
