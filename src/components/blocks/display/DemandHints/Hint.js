// src/components/blocks/display/DemandHints/Hint.js
//
// Individual hint content - used inside DemandHints.
//
// Usage:
//   <DemandHints>
//     <Hint>Think about the power rule...</Hint>
//     <Hint>For x^2, apply the formula...</Hint>
//   </DemandHints>
//
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import _Hint from './_Hint';

export const fields = state.fields([]);

const Hint = core({
  ...parsers.blocks.allowHTML(),
  name: 'Hint',
  description: 'Individual hint content for DemandHints',
  category: 'display',
  component: _Hint,
  fields
});

export default Hint;
