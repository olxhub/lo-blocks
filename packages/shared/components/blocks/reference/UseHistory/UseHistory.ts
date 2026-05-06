// src/components/blocks/UseHistory.js
import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { _UseHistory } from './_UseHistory';
import { ignore } from '@/lib/content/parsers';
import { z_reduxStateRef } from '@/lib/blocks/attributeSchemas';

export const fields = state.fields([
  'value',
  'history',
  'index',
  { name: 'showHistory', scope: 'componentSetting' },
  { name: 'follow', scope: 'componentSetting' }
]);

const UseHistory = dev({
  ...ignore(),
  name: 'UseHistory',
  component: _UseHistory,
  description: 'Like UseDynamic with history navigation.',
  fields,
  attributes: z.object({
    target: z_reduxStateRef.optional().describe('Component ID to track'),
    targetRef: z_reduxStateRef.optional().describe('ID of component whose value determines the target'),
    initial: z_reduxStateRef.optional().describe('Initial block to display before any repointing'),
    appendRepeats: z.boolean().default(false).describe('If true, repointing to a value already in history appends a duplicate dot. If false (default), navigates to the existing entry.'),
  }).strict(),
});

export default UseHistory;
