// src/components/blocks/PEGDevBlock/PEGDevBlock.js
import { dev } from '@/lib/blocks';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import * as dp  from './_demoParser'; // <-- Tweak this line
import { _PEGDevBlock } from './_PEGDevBlock';

const PEGDevBlock = dev({
  ...peggyParser(dp),
  name: 'PEGDevBlock',
  component: _PEGDevBlock,
  description: 'Development workbench for creating and testing PEG grammars',
  internal: true,
  attributes: srcAttributes.strict(),
});

export default PEGDevBlock;
