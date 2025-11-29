// src/components/blocks/layout/Tabs/Tabs.js

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _Tabs from './_Tabs';

export const fields = state.fields(['activeTab']);

const Tabs = dev({
  ...parsers.blocks(),
  name: 'Tabs',
  description: 'Tabbed interface component with multiple content panels',
  component: _Tabs,
  fields: fields,
  getValue: (props, state, id) => {
    const activeTab = fieldSelector(state, props, fieldByName('activeTab'), { fallback: 0, id });
    return { activeTab };
  }
});

export default Tabs;
