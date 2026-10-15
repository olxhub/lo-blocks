// FocusAction - focuses the first focusable control in a visible target block.

import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';
import { findVisibleBlock } from '../visibleTarget';

const FOCUSABLE = 'input, textarea, select, [contenteditable], button';

export function focusAction({ props }) {
  const { target } = props;
  if (!target) {
    console.warn('FocusAction: No target specified');
    return;
  }

  const wrapper = findVisibleBlock(target, props.runtime.ns);
  if (!wrapper) {
    console.warn(`FocusAction: Target "${target}" not found in visible DOM`);
    return;
  }

  const descendant = wrapper.querySelector<HTMLElement>(FOCUSABLE);
  if (descendant) {
    descendant.focus();
    return;
  }
  if (wrapper.hasAttribute('tabindex')) {
    wrapper.focus();
    return;
  }

  console.warn(`FocusAction: Target "${target}" has no focusable element`);
}

const FocusAction = blocks.core({
  ...parsers.ignore(),
  ...blocks.action({ action: focusAction }),
  name: 'FocusAction',
  description: 'Focuses the first focusable element in a visible target block when triggered',
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  attributes: z.object({
    target: z_stateRef.describe('ID of the block whose first control should receive focus'),
  }).strict(),
});

export default FocusAction;
