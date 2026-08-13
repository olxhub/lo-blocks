// TimeVisible - temporary client-side stopwatch for the current writing
// content. This is an internal stopgap until server-side analytics can record
// attended time properly; it is not the platform's analytics architecture.
//
// Usage:
//   <Tab title="Drafting">
//     <TextArea id="draft" />
//     <TimeVisible id="time_drafting" />
//   </Tab>
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
  ...parsers.ignore(),
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
