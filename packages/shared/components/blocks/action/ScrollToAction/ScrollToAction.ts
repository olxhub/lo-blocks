// ScrollToAction - smoothly scrolls a visible target block into view.

import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';
import { findVisibleBlock } from '../visibleTarget';

export function scrollToAction({ props }) {
  const { target, block = 'start' } = props;
  if (!target) {
    console.warn('ScrollToAction: No target specified');
    return;
  }

  const element = findVisibleBlock(target, props.runtime.ns);
  if (!element) {
    console.warn(`ScrollToAction: Target "${target}" not found in visible DOM`);
    return;
  }

  element.scrollIntoView({ behavior: 'smooth', block });
}

const ScrollToAction = blocks.core({
  ...parsers.ignore(),
  ...blocks.action({ action: scrollToAction }),
  name: 'ScrollToAction',
  description: 'Smoothly scrolls a visible target block into view when triggered',
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  attributes: z.object({
    target: z_stateRef.describe('ID of the block to scroll into view'),
    block: z.enum(['start', 'center', 'end']).optional()
      .describe('Vertical alignment of the target (defaults to start)'),
  }).strict(),
});

export default ScrollToAction;
