// src/components/blocks/ChoiceInput/Key.js
//
// TODO: MAJOR BUG - Child blocks inside Key (e.g., <Key><InlineMath>x^2</InlineMath></Key>)
// do not render correctly. They appear as raw XML/JSON like:
//   {"InlineMath":[{"#text":"SE = \\frac{\\sigma}{\\sqrt{n}}"}],":@":{"id":"..."}}
// This MUST be fixed to support math in answer choices. Key needs to use parsers.blocks()
// instead of parsers.text(), and _ChoiceItem needs to render children properly.
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import _ChoiceItem from './_ChoiceItem.jsx';

const Key = core({
  ...parsers.text(),
  name: 'Key',
  description: 'Correct answer option inside ChoiceInput',
  component: _ChoiceItem,
  attributes: srcAttributes.extend({
    value: z.string().optional().describe('Value submitted when selected; defaults to element ID'),
  }),
});

export default Key;
