// src/components/blocks/ActionButton.js
import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _ActionButton from './_ActionButton';

const ActionButton = blocks.dev({
  ...parsers.blocks,
  name: 'ActionButton',
  component: _ActionButton,
});

export default ActionButton;
