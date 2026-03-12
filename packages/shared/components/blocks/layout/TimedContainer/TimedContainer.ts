// TimedContainer - container that enforces a time limit on child activities.
//
// Usage:
//   <TimedContainer duration="5 minutes" start="go">
//     <TextArea id="response" rows="5" />
//   </TimedContainer>

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { baseAttributes, z_olx_boolean, z_olx_duration } from '@/lib/blocks/attributeSchemas';
import _TimedContainer from './_TimedContainer';

export const fields = state.fields([
  'started',
  'expired',
  'startTime',
  'remaining',
]);

const TimedContainer = dev({
  ...parsers.blocks(),
  name: 'TimedContainer',
  description: 'Container with a time limit that disables interaction when time expires',
  component: _TimedContainer,
  fields,
  attributes: baseAttributes.extend({
    duration: z_olx_duration.describe('Time limit (e.g. "5 minutes", "1 hour 30 minutes", "2 days")'),
    start: z.enum(['render', 'go']).default('go')
      .describe('When timer starts: "render" (immediately) or "go" (user clicks Start)'),
    label: z.string().optional()
      .describe('Start button text (default: "Start")'),
    before: z.string().optional()
      .describe('Text shown on the start screen (above duration and button)'),
    after: z.string().optional()
      .describe('Text shown after time runs out'),
    hideuntilstart: z_olx_boolean.default(false)
      .describe('Hide content until the timer starts'),
  }),
});

export default TimedContainer;
