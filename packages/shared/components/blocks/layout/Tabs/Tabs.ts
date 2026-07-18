// packages/shared/components/blocks/layout/Tabs/Tabs.ts

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { decodedFieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';

export const fields = state.fields(['activeTab']);

const Tabs = dev({
  ...parsers.blocks(),
  name: 'Tabs',
  description: 'Tabbed interface component with multiple content panels',
  fields: fields,
  selectors: {
    value: (state, props, _stateKey) => {
      const activeTab = decodedFieldSelector(state, props, fields.activeTab, { fallback: 0 });
      return { activeTab };
    },
  },
});

export default Tabs;
