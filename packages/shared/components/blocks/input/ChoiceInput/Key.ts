// packages/shared/components/blocks/input/ChoiceInput/Key.ts
//
// Correct answer option inside ChoiceInput.
//
// Uses blocks.wrapText('Markdown') so both bare text and nested blocks work:
//   <Key>True</Key>              → text auto-wrapped in Markdown
//   <Key><InlineMath>x^2</InlineMath></Key>  → block passed through
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';

const Key = core({
  ...parsers.blocks.wrapText('Markdown'),
  name: 'Key',
  description: 'Correct answer option inside ChoiceInput',
  // Non-conventional: shared with Distractor, so it lives in _ChoiceItem rather than _Key.
  componentLoader: () => import('./_ChoiceItem').then(m => m.default),
  requiresUniqueId: false,
  attributes: srcAttributes.extend({
    value: z.string().optional().describe('Value submitted when selected; defaults to element ID'),
  }),
});

export default Key;
