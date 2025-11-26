// src/components/blocks/PEGDevBlock/PEGDevBlock.js
import { dev } from '@/lib/blocks';
import { peggyParser } from '@/lib/content/parsers';
import * as dp  from './_demoParser.js'; // <-- Tweak this line
import { _PEGDevBlock } from './_PEGDevBlock';

const PEGDevBlock = dev({
  ...peggyParser(dp),
  name: 'PEGDevBlock',
  component: _PEGDevBlock,
  namespace: 'org.mitros.dev',
  description: 'Example block that parses an SBA dialogue format using PEG.'
});

export default PEGDevBlock;
