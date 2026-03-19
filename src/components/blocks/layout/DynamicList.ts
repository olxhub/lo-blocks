// src/components/blocks/DynamicList.js
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _DynamicList from './_DynamicList';

export const fields = state.fields(['count']);

const DynamicList = core({
  ...parsers.blocks(),
  name: 'DynamicList',
  description: 'Container that repeat a child component with adjustable length (e.g. for supporting arguments in a graphic organizer)',
  component: _DynamicList,
  fields,
  attributes: baseAttributes.extend({
    min: z.coerce.number().optional().describe('Minimum number of items (default: 1)'),
    max: z.coerce.number().optional().describe('Maximum number of items'),
    start: z.coerce.number().optional().describe('Initial number of items (default: 3)'),
  }),
});

export default DynamicList;
