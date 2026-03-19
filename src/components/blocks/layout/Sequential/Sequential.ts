// src/components/blocks/Sequential.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Sequential from './_Sequential';

export const fields = state.fields([
  { name: 'index', scope: 'component' }  // Current sequence index
]);

const Sequential = core({
  ...parsers.blocks(),
  name: 'Sequential',
  description: 'Linear step-through showing one piece of content at a time, with guided, sequential navigation',
  component: _Sequential,
  fields,
  attributes: baseAttributes.strict(),
});

export default Sequential;
