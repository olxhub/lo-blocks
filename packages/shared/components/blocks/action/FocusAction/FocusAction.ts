// FocusAction - focuses the first focusable control in a visible target block.

import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';
import { findVisibleBlock } from '../visibleTarget';

// These elements may be programmatically focusable. Browser focus is the
// final authority: disabled, hidden, and otherwise inert candidates will not
// become document.activeElement, so continue to the next candidate.
const FOCUS_CANDIDATES = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable]',
  '[tabindex]',
].join(', ');

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

  for (const candidate of wrapper.querySelectorAll<HTMLElement>(FOCUS_CANDIDATES)) {
    candidate.focus();
    if (document.activeElement === candidate) return;
  }

  if (wrapper.hasAttribute('tabindex')) {
    wrapper.focus();
    if (document.activeElement === wrapper) return;
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
