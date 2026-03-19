// src/components/blocks/ChoiceInput/Key.js
//
// Correct answer option inside ChoiceInput.
//
// Uses blocks parser so hand-authored OLX can include nested blocks
// (e.g., <Key><InlineMath>x^2</InlineMath></Key>). MarkupProblem wraps
// choice text in Markdown blocks, so both paths produce block kids.
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import _ChoiceItem from './_ChoiceItem';

const Key = core({
  ...parsers.blocks(),
  name: 'Key',
  description: 'Correct answer option inside ChoiceInput',
  component: _ChoiceItem,
  requiresUniqueId: false,
  attributes: srcAttributes.extend({
    value: z.string().optional().describe('Value submitted when selected; defaults to element ID'),
  }),
});

export default Key;
