// TimeVisible - temporary client-side stopwatch for the current writing
// content. This is an internal stopgap until server-side analytics can record
// attended time properly; it is not the platform's analytics architecture.
//
// TODO(server-analytics): Revisit the shape of the eventual analytics primitive
// rather than treating this temporary API as settled:
//   - Keep this explicit one-child wrapper, add/replace it with a marker or
//     tracking-pixel mode that measures its containing context, or support both?
//   - Record only attended duration, or also visits, returns, and session-like
//     events?
//   - Does "visible" mean mounted and participating in layout (current), inside
//     the viewport, focused, or an author-selectable policy?
// These choices belong with the server-side event model and should be made
// together before this block is promoted beyond its writing-content use.
//
// Usage:
//   <TimeVisible id="time_drafting">
//     <TextArea id="draft" />
//   </TimeVisible>
//
// The accumulated total (in seconds) lives in the standard `value` field, so
// it can be read by any other block: {{@time_drafting.value}}, target=, a
// grader, or an ObservablePlot spec.

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { commonFields } from '@/lib/state';
import { z_olx_boolean, z_olx_duration } from '@/lib/blocks/attributeSchemas';

// `value` is the running total of attended seconds. Persisted like any other
// field, so a refresh continues the count rather than restarting it.
export const fields = state.fields([commonFields.value]);

const TimeVisible = dev({
  ...parsers.blocks({ requiredChildren: 1 }),
  name: 'TimeVisible',
  description: 'Temporary writing-content timer for approximate attended time',
  internal: true,
  fields,
  // Not an input — it is never graded. Other blocks read the running total
  // through the plain `value` field: {{@time_drafting.value}}, target=, etc.
  attributes: z.object({
    idleTimeout: z_olx_duration.default(60)
      .describe('Pause the clock after this long with no keyboard/mouse/touch activity (e.g. "60 seconds", "2 minutes")'),
    debug: z_olx_boolean.default(false)
      .describe('Show the running total on screen (development aid)'),
  }).strict(),
});

export default TimeVisible;
