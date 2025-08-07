// src/components/blocks/ActionButton.js
import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _ActionButton from './_ActionButton';

const ActionButton = blocks.dev({
  ...parsers.blocks(),
  name: 'ActionButton',
  // TODO: Make targets attribute configurable - currently acts on child actions but should support parent/related nodes
  description: 'Clickable button that triggers actions on related components',
  component: _ActionButton,
});

export default ActionButton;
