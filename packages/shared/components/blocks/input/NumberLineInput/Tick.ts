// packages/shared/components/blocks/input/NumberLineInput/Tick.ts
//
// One labeled position on a NumberLineInput.
//
// Like <Key>/<Distractor> inside a ChoiceInput, a Tick is content: its kids
// are Markdown (a word, an emoji, an image), and they are what the learner
// reads. The number lives in value=; the label never becomes the stored
// value. Endpoint labels are simply Ticks at min and at max.
//
// Uses blocks.wrapText('Markdown') so both bare text and nested blocks work:
//   <Tick value="5">Strongly agree</Tick>
//   <Tick value="0"><Image src="elephant.png" alt="an elephant" /></Tick>
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { z_olx_number } from '@/lib/blocks/attributeSchemas';

const Tick = core({
  ...parsers.blocks.wrapText('Markdown'),
  name: 'Tick',
  description: 'A labeled position on a NumberLineInput (only valid inside one)',
  requiresUniqueId: false,
  attributes: z.object({
    value: z_olx_number.describe('Position on the number line (required; must lie between the line\'s min and max)'),
    label: z.string().optional()
      .describe('Plain-text label for screen readers; defaults to this tick\'s own text'),
  }).strict(),
});

export default Tick;
