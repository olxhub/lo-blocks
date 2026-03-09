// OnShow - triggers child actions the first time this block is shown (or each time, if opted in).

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _OnShow from './_OnShow';

export const fields = state.fields([
  { name: 'hasRun', scope: 'component' } // Tracks whether lifetime mode has fired
]);

const OnShow = dev({
  ...parsers.blocks(),
  name: 'OnShow',
  description: 'Triggers child action blocks automatically when the block is shown',
  component: _OnShow,
  fields,
  attributes: baseAttributes.extend({
    trigger: z.enum(['first_view', 'each_view']).default('first_view')
      .describe('When to trigger: "first_view" (first time only, persists across remounts) or "each_view" (each time this block is shown)'),
  }),
});

export default OnShow;
