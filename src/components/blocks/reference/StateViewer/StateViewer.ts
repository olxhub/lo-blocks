// src/components/blocks/reference/StateViewer/StateViewer.js
import { z } from 'zod';
import { test } from '@/lib/blocks';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import _StateViewer from './_StateViewer';

const StateViewer = test({
  name: 'StateViewer',
  component: _StateViewer,
  description: 'Display the Redux state of another component by ID. For debugging/introspection only.',
  attributes: srcAttributes.extend({
    target: z.string().optional().describe('ID of component whose state to display'),
    scope: z.enum(['component', 'componentSetting', 'system', 'storage']).optional().describe('Scope of state to display'),
  }),
});

export default StateViewer;
