// Flash - applies a momentary highlight animation to a target block.
//
// Usage:
//   <ActionButton label="Look!">
//     <Flash target="important_block" color="gold" duration="500ms"/>
//   </ActionButton>
//
//   <Trigger watch="@grader.correct === correctness.correct">
//     <Flash target="next_step" color="lightgreen"/>
//   </Trigger>

import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';
import { findVisibleBlock } from '../visibleTarget';

export function flashAction({ props }) {
  const { target, duration = '800ms', color = 'var(--lo-info-subtle)' } = props;

  if (!target) {
    console.warn('[Flash] No target specified');
    return;
  }

  const el = findVisibleBlock(target, props.runtime.ns);
  if (!el) {
    console.warn(`[Flash] Target "${target}" not found in visible DOM`);
    return;
  }

  // Set custom properties and add animation class
  el.style.setProperty('--lo-flash-color', color);
  el.style.setProperty('--lo-flash-duration', duration);

  // Remove class first in case it's already animating (allows re-trigger)
  el.classList.remove('lo-flash-active');
  // Force reflow to restart animation
  void el.offsetWidth;
  el.classList.add('lo-flash-active');

  // Clean up when animation ends
  el.addEventListener('animationend', () => {
    el.classList.remove('lo-flash-active');
  }, { once: true });
}

const Flash = blocks.core({
  ...parsers.ignore(),
  ...blocks.action({ action: flashAction }),
  name: 'Flash',
  description: 'Applies a momentary highlight animation to a target block',
  // Shared no-op renderer lives in layout/, not a sibling of this file.
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  attributes: z.object({
    target: z_stateRef.describe('Block ID to flash'),
    duration: z.string().default('800ms').describe('Animation duration (CSS time value)'),
    color: z.string().default('var(--lo-info-subtle)').describe('Flash color (CSS color value)'),
  }).strict(),
});

export default Flash;
