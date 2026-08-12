// packages/shared/components/blocks/display/TextBlock.ts

import * as parsers from '@/lib/content/parsers';
import { test } from '@/lib/blocks';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';

const TextBlock = test({
  ...parsers.textWithTemplate(parsers.text()),
  name: "TextBlock",
  description: 'Simple text container for testing and development',
  requiresUniqueId: false,
  attributes: srcAttributes.strict(),
});

export default TextBlock;
