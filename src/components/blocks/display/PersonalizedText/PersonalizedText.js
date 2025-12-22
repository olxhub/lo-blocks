// src/components/blocks/display/PersonalizedText/PersonalizedText.js
//
// PersonalizedText block - target for LLMAction to populate with generated text.
// Used inside Gated blocks for personalized content generation.
//
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _PersonalizedText from './_PersonalizedText';

export const fields = state.fields(['value', 'state']);

const PersonalizedText = test({
  ...parsers.ignore(), // No children expected
  name: 'PersonalizedText',
  description: 'Simple text display populated by LLMAction - used for personalized content',
  component: _PersonalizedText,
  fields,
});

export default PersonalizedText;
