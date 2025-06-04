import React from 'react';

import * as parsers from '@/lib/olx/parsers';
import { Trace } from '@/lib/debug';
import { test } from '@/lib/blocks';

function _TextBlock( props ) {
  const { kids } = props;
  return (
    <div className="p-4 rounded bg-blue-50 text-blue-900">
      <Trace props={ props } />
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
