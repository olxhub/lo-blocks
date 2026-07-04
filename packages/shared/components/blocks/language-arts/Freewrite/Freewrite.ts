// Freewrite - freewriting input with optional constraints.
//
// Designed to be used inside TimedContainer for timed sessions.
// Constraints (all default false, teacher opts in):
//   invisible  - hide text while writing (bypass inner critic)
//   nodelete   - no backspace/delete (forward momentum only)
//   counter    - show live word count
//   pace       - gamified pause indicator (smooth green → red decay)
//
// Usage:
//   <TimedContainer duration="3 minutes">
//     <Freewrite invisible="true" nodelete="true" counter="true" pace="true" />
//   </TimedContainer>

import { z } from 'zod';
import { dev, input } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { commonFields } from '@/lib/state';
import { z_olx_boolean, z_olx_duration, placeholder } from '@/lib/blocks/attributeSchemas';

export const fields = state.fields([commonFields.value, 'revealed', 'lastKeystrokeTime']);

const Freewrite = dev({
  ...parsers.ignore(),
  ...input(),
  name: 'Freewrite',
  description: 'Freewriting input with optional constraints (invisible text, no deletion, pace tracking). Use inside TimedContainer for timed sessions.',
  fields,
  attributes: z.object({
    ...placeholder,
    invisible: z_olx_boolean.default(false)
      .describe('Hide text while writing — students cannot see what they type'),
    nodelete: z_olx_boolean.default(false)
      .describe('Disable backspace and delete — forward-only writing'),
    autofocus: z_olx_boolean.default(true)
      .describe('Focus the textarea when the exercise starts'),
    counter: z_olx_boolean.default(false)
      .describe('Show live word count'),
    pace: z_olx_boolean.default(false)
      .describe('Show pace indicator bar that decays during pauses'),
    pacedecay: z_olx_duration.default('5 seconds')
      .describe('How long the pace bar takes to decay from green to red (e.g. "2 seconds", "10 seconds")'),
    reveal: z_olx_boolean.default(false)
      .describe('Show a Reveal button that ends the exercise and shows the text'),
    rows: z.union([z.string(), z.number()])
      .pipe(z.coerce.number().int().positive())
      .default(8)
      .describe('Number of visible text rows'),
  }).strict(),
});

export default Freewrite;
