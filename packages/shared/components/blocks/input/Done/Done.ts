// Done - lets a learner mark a self-directed activity as complete.

import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { commonFields, decodedFieldSelector } from '@/lib/state';
import { z_olx_boolean } from '@/lib/blocks/attributeSchemas';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([
  { ...commonFields.value, schema: z_olx_boolean },
]);

const Done = core({
  ...parsers.ignore(),
  ...input({ valueSchema: z.boolean() }),
  name: 'Done',
  description: 'Lets a learner mark a self-directed activity as complete',
  fields,
  selectors: {
    value: (reduxState, props: RuntimeProps, stateKey) =>
      decodedFieldSelector(reduxState, props, fields.value, { stateKey, fallback: false }),
  },
  attributes: z.object({
    align: z.enum(['left', 'center', 'right']).default('left')
      .describe('Horizontal alignment of the completion control'),
  }).strict(),
});

export default Done;
