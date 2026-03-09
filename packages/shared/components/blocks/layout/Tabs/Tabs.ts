// src/components/blocks/layout/Tabs/Tabs.js

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Tabs from './_Tabs';

export const fields = state.fields(['activeTab']);

const Tabs = dev({
  ...parsers.blocks(),
  name: 'Tabs',
  description: 'Tabbed interface component with multiple content panels',
  component: _Tabs,
  fields: fields,
  // as any: See selectValue spec in lib/blocks/actions.tsx
  selectValue: ((props, state, _reduxKey) => {
    const activeTab = fieldSelector(state, props, fields.activeTab, { fallback: 0 });
    return { activeTab };
  }) as any,
  attributes: baseAttributes.strict(),
});

export default Tabs;
