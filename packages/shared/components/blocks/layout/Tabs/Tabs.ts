// packages/shared/components/blocks/layout/Tabs/Tabs.ts

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';

export const fields = state.fields(['activeTab']);

const Tabs = dev({
  ...parsers.blocks(),
  name: 'Tabs',
  description: 'Tabbed interface component with multiple content panels',
  fields: fields,
  // as any: See selectValue spec in lib/blocks/actions.tsx
  selectValue: ((props, state, _stateKey) => {
    const activeTab = fieldSelector(state, props, fields.activeTab, { fallback: 0 });
    return { activeTab };
  }) as any,
});

export default Tabs;
