// packages/shared/components/blocks/layout/Tabs/Tabs.ts

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import { printModes } from '@/lib/blocks/attributeSchemas';
import * as parsers from '@/lib/content/parsers';
import { shallowEqual } from 'react-redux';

export const fields = state.fields(['activeTab']);

const Tabs = dev({
  ...parsers.blocks(),
  name: 'Tabs',
  description: 'Tabbed interface component with multiple content panels',
  fields: fields,
  // Widen the base `print` enum with a Tabs-specific mode. The base values
  // keep their meaning; "no-chrome" additionally hides the tab header strip
  // in print, so the active panel prints as a plain page.
  attributes: z.object({
    print: z.enum([...printModes, 'no-chrome']).optional()
      .describe('Print/PDF output: "false" hides the tabs entirely, "no-chrome" hides the tab header strip in print (the active panel still prints), "true" (default) prints everything'),
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
