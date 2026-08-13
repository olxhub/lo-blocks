// packages/shared/components/blocks/layout/Tabs/Tabs.ts

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { canonicalKidCursorValue } from '@/lib/player/kidCursor';
import type { RuntimeProps } from '@/lib/types';
import { shallowEqual } from 'react-redux';

export const fields = state.fields(['activeTab']);

const Tabs = dev({
  ...parsers.blocks(),
  name: 'Tabs',
  description: 'Tabbed interface component with multiple content panels',
  fields: fields,
  selectors: {
    value: {
      select: (state, props, _stateKey) => {
        const activeTab = fieldSelector(state, props, fields.activeTab, { fallback: null });
        return { activeTab };
      },
      // Fresh object per evaluation — subscribers gate on content.
      equality: shallowEqual,
    },
  },
  setters: {
    activeTab: (value, props: RuntimeProps) => {
      state.updateField(
        props,
        fields.activeTab,
        canonicalKidCursorValue(value, props.runtime.ns),
      );
    },
  },
});

export default Tabs;
