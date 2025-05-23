import React from 'react';
import { dev } from '@/lib/blocks';
import { peggyParser } from '@/lib/olx/parsers';
import * as dp  from './_capaParser.js'; // <-- Tweak this line
import { _PEGDevBlock } from './_PEGDevBlock';

const PEGDevBlock = dev({
  name: 'PEGDevBlock',
  component: _PEGDevBlock,
  parser: peggyParser(dp),
  namespace: 'org.mitros.dev',
  description: 'Example block that parses an SBA dialogue format using PEG.'
});

export default PEGDevBlock;
