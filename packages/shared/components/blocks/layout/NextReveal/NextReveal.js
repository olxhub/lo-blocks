// src/components/blocks/layout/NextReveal/NextReveal.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _NextReveal from './_NextReveal';

export const fields = state.fields([
  { name: 'currentStep', scope: 'component' }  // Number of steps revealed
]);

const NextReveal = core({
  ...parsers.blocks(),
  name: 'NextReveal',
  description: 'Progressive reveal container that shows children one at a time with Next buttons, scrolling to bottom on Next but allowing up-scrolling',
  component: _NextReveal,
  fields,
  category: 'layout',
  attributes: baseAttributes.strict(),
});

export default NextReveal;
