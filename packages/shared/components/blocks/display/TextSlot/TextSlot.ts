// src/components/blocks/display/TextSlot/TextSlot.js
//
// TextSlot block - a slot that receives text from other blocks (e.g., LLMAction).
// Used inside IntakeGate for dynamic content generation.
//
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _TextSlot from './_TextSlot';

export const fields = state.fields(['value', 'state']);

const TextSlot = test({
  ...parsers.ignore(), // No children expected
  name: 'TextSlot',
  description: 'A slot that receives text from other blocks (e.g., LLMAction)',
  component: _TextSlot,
  fields,
});

export default TextSlot;
