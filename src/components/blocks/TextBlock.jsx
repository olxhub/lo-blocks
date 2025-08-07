// src/components/blocks/TextBlock.jsx
import React from 'react';

import * as parsers from '@/lib/content/parsers';
// DebugWrapper will render debug details globally
import { test } from '@/lib/blocks';

function _TextBlock( props ) {
  const { kids } = props;
  return (
    <div>
     {kids}
    </div>
  );
}

const TextBlock = test({
  ...parsers.text(),
  name: "TextBlock",
  description: 'Simple text container for testing and development',
  component: _TextBlock
});

export default TextBlock;
