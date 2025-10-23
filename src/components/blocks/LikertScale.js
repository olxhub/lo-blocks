// src/components/blocks/LikertScale.js
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _LikertScale from './_LikertScale';

export const fields = state.fields([
  'responses'
]);

const LikertScale = dev({
  ...parsers.blocks(),
  name: 'LikertScale',
  description: 'Interactive Likert scale table that captures responses across statements',
  component: _LikertScale,
  fields,
  requiresUniqueId: false,
  getValue: (props, state, id) => {
    const responses = fieldSelector(state, props, fieldByName('responses'), { fallback: null, id });
    return responses;
  }
});

export default LikertScale;