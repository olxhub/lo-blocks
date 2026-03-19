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
  // as any: See getValue spec in lib/blocks/actions.tsx
  getValue: ((props, state, id) => {
    const activeTab = fieldSelector(state, props, fields.activeTab, { fallback: 0, id });
    return { activeTab };
  }) as any,
  attributes: baseAttributes.strict(),
});

export default Tabs;
