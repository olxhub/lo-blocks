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
import { baseAttributes, z_reduxStateKey } from '@/lib/blocks/attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';

function flashAction({ targetInstance }) {
  const { target, duration = '500ms', color = 'gold' } = targetInstance.attributes;

  if (!target) {
    console.warn('[Flash] No target specified');
    return;
  }

  const el = document.querySelector(`[data-block-id="${CSS.escape(target)}"]`);
  if (!el) {
    console.warn(`[Flash] Target "${target}" not found in DOM`);
    return;
  }

  // Set custom properties and add animation class
  const htmlEl = el as HTMLElement;
  htmlEl.style.setProperty('--lo-flash-color', color);
  htmlEl.style.setProperty('--lo-flash-duration', duration);

  // Remove class first in case it's already animating (allows re-trigger)
  htmlEl.classList.remove('lo-flash-active');
  // Force reflow to restart animation
  void htmlEl.offsetWidth;
  htmlEl.classList.add('lo-flash-active');

  // Clean up when animation ends
  htmlEl.addEventListener('animationend', () => {
    htmlEl.classList.remove('lo-flash-active');
  }, { once: true });
}

const Flash = blocks.core({
  ...parsers.ignore(),
  ...blocks.action({ action: flashAction }),
  name: 'Flash',
  description: 'Applies a momentary highlight animation to a target block',
  component: _Noop,
  attributes: baseAttributes.extend({
    target: z_reduxStateKey.describe('Block ID to flash'),
    duration: z.string().default('500ms').describe('Animation duration (CSS time value)'),
    color: z.string().default('gold').describe('Flash color (CSS color value)'),
  }),
});

export default Flash;
