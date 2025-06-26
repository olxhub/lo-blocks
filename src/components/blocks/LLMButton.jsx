import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _ActionButton from './_ActionButton';

// src/components/blocks/LLMButton.jsx
// Basic wrapper around ActionButton for LLM interactions

const LLMButton = blocks.dev({
  ...parsers.blocks,
  name: 'LLMButton',
  component: _ActionButton
});

export default LLMButton;
