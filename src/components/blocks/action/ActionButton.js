// src/components/blocks/ActionButton.js
import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state'
import _ActionButton from './_ActionButton';

export const fields = state.fields([
  'isDisabled'
])

const ActionButton = blocks.dev({
  ...parsers.blocks(),
  name: 'ActionButton',
  // TODO: Make targets attribute configurable - currently acts on child actions but should support parent/related nodes
  description: 'Clickable button that triggers actions on related components',
  component: _ActionButton,
  fields,
});

export default ActionButton;
