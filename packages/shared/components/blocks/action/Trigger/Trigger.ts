// Trigger - fires related actions when a DSL expression becomes true.
//
// Usage:
//   <Trigger watch="@grader.correct === correctness.correct">
//     <Flash target="next_step" color="gold"/>
//   </Trigger>
//
//   <Trigger watch="@geography_lesson.correct === correctness.correct" mode="once">
//     <SetFieldAction target="maps_tab" field="unlocked" value="true"/>
//     <Flash target="maps_tab"/>
//   </Trigger>
//
// Note: Uses `watch` not `when` — `when=` is reserved by baseAttributes
// for conditional visibility (hides the block when false). Trigger must stay
// mounted to detect false→true transitions.

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { z_expression, z_triggerMode } from '@/lib/blocks/attributeSchemas';

export const fields = state.fields([
  { name: 'hasTriggered', scope: 'component' },
  { name: 'prevValue', scope: 'component' },
]);

const Trigger = dev({
  ...parsers.blocks(),
  name: 'Trigger',
  description: 'Fires related actions when a DSL expression becomes true (edge-triggered)',
  fields,
  attributes: z.object({
    watch: z_expression.describe('DSL expression to watch (e.g., "@grader.correct === correctness.correct")'),
    mode: z_triggerMode
      .describe('"once" fires only the first time (persists across remounts), "each" fires every false→true transition'),
  }).strict(),
});

export default Trigger;
