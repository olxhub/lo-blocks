// packages/shared/components/blocks/input/ChoiceInput/Distractor.ts
//
// Incorrect answer option inside ChoiceInput.
//
// Uses blocks.wrapText('Markdown') so both bare text and nested blocks work:
//   <Distractor>False</Distractor>              → text auto-wrapped in Markdown
//   <Distractor><InlineMath>x^2</InlineMath></Distractor>  → block passed through
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';

const Distractor = core({
  ...parsers.blocks.wrapText('Markdown'),
  name: 'Distractor',
  description: 'Incorrect answer option inside ChoiceInput',
  // Non-conventional: shared with Key, so it lives in _ChoiceItem rather than _Distractor.
  componentLoader: () => import('./_ChoiceItem').then(m => m.default),
  requiresUniqueId: false,
  attributes: srcAttributes.extend({
    value: z.string().optional().describe('Value submitted when selected; defaults to element ID'),
  }),
});

export default Distractor;
