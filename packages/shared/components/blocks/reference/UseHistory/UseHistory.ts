// packages/shared/components/blocks/reference/UseHistory/UseHistory.ts
import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { _UseHistory } from './_UseHistory';
import { ignore } from '@/lib/content/parsers';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';

export const fields = state.fields([
  'value',
  'history'
]);

const UseHistory = dev({
  ...ignore(),
  name: 'UseHistory',
  component: _UseHistory,
  description: 'Like UseDynamic with history navigation.',
  fields,
  attributes: z.object({
    target: z_stateRef.optional().describe('Component ID to track'),
    targetRef: z_stateRef.optional().describe('ID of component whose value determines the target'),
    initial: z_stateRef.optional().describe('Initial block to display before any repointing'),
  }).strict(),
});

export default UseHistory;
