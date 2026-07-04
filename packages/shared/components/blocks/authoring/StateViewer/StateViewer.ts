// packages/shared/components/blocks/authoring/StateViewer/StateViewer.ts
import { z } from 'zod';
import { test } from '@/lib/blocks';
import { srcAttributes, z_stateRef } from '@/lib/blocks/attributeSchemas';

const StateViewer = test({
  name: 'StateViewer',
  description: 'Display the Redux state of another component by ID. For debugging/introspection only.',
  attributes: srcAttributes.extend({
    target: z_stateRef.optional().describe('ID of component whose state to display'),
    scope: z.enum(['component', 'componentSetting', 'system', 'storage']).optional().describe('Scope of state to display'),
  }),
});

export default StateViewer;
