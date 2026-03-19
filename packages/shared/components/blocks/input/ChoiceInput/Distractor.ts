// src/components/blocks/ChoiceInput/Distractor.js
//
// Incorrect answer option inside ChoiceInput.
//
// Uses blocks parser so hand-authored OLX can include nested blocks
// (e.g., <Distractor><InlineMath>x^2</InlineMath></Distractor>).
// MarkupProblem wraps choice text in Markdown blocks, so both paths
// produce block kids.
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import _ChoiceItem from './_ChoiceItem';

const Distractor = core({
  ...parsers.blocks(),
  name: 'Distractor',
  description: 'Incorrect answer option inside ChoiceInput',
  component: _ChoiceItem,
  requiresUniqueId: false,
  attributes: srcAttributes.extend({
    value: z.string().optional().describe('Value submitted when selected; defaults to element ID'),
  }),
});

export default Distractor;
