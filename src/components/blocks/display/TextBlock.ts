// src/components/blocks/TextBlock.jsx

import * as parsers from '@/lib/content/parsers';
import { test } from '@/lib/blocks';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import _TextBlock from './_TextBlock';

const TextBlock = test({
  ...parsers.text(),
  name: "TextBlock",
  description: 'Simple text container for testing and development',
  component: _TextBlock,
  requiresUniqueId: false,
  attributes: srcAttributes.strict(),
});

export default TextBlock;
