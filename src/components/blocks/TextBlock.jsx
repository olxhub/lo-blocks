// src/components/blocks/TextBlock.jsx
import React from 'react';

import * as parsers from '@/lib/olx/parsers';
// DebugWrapper will render debug details globally
import { test } from '@/lib/blocks';

function _TextBlock( props ) {
  const { kids } = props;
  return (
    <div className="p-4 rounded bg-blue-50 text-blue-900">
     {kids}
    </div>
  );
}

const TextBlock = test({
  ...parsers.text,
  name: "TextBlock",
  component: _TextBlock
});

export default TextBlock;
