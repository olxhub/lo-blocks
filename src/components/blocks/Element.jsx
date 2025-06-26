import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Noop from './_Noop';

// src/components/blocks/Element.jsx
// Placeholder block used inside <LLMPrompt> to reference another block's value

const Element = blocks.dev({
  ...parsers.text,
  name: 'Element',
  component: _Noop
});

export default Element;
