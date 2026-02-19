// src/components/blocks/ChoiceInput/Distractor.js
//
// TODO: MAJOR BUG - Child blocks inside Distractor (e.g., <Distractor><InlineMath>x^2</InlineMath></Distractor>)
// do not render correctly. They appear as raw XML/JSON like:
//   {"InlineMath":[{"#text":"SE = \\frac{\\sigma}{\\sqrt{n}}"}],":@":{"id":"..."}}
// This MUST be fixed to support math in answer choices. Distractor needs to use parsers.blocks()
// instead of parsers.text(), and _ChoiceItem needs to render children properly.
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import _ChoiceItem from './_ChoiceItem';

const Distractor = core({
  ...parsers.text(),
  name: 'Distractor',
  description: 'Incorrect answer option inside ChoiceInput',
  component: _ChoiceItem,
  requiresUniqueId: false,
  attributes: srcAttributes.extend({
    value: z.string().optional().describe('Value submitted when selected; defaults to element ID'),
  }),
});

export default Distractor;
