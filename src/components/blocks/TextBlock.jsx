// src/components/blocks/TextBlock.jsx

import * as parsers from '@/lib/content/parsers';
// DebugWrapper will render debug details globally
import { test } from '@/lib/blocks';
import _TextBlock from './_TextBlock';

const TextBlock = test({
  ...parsers.text(),
  name: "TextBlock",
  description: 'Simple text container for testing and development',
  component: _TextBlock,
  requiresUniqueId: false
});

export default TextBlock;
