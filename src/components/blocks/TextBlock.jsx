import React from 'react';

import * as parsers from '@/lib/olx/parsers';
import { Trace } from '@/lib/debug';
import { test } from '@/lib/blocks';

function _TextBlock({ kids, url_name }) {
  return (
    <div className="p-4 rounded bg-blue-50 text-blue-900">
      <Trace>[TextBlock / (url_name: {url_name || 'n/a'})]</Trace>
     {kids}
    </div>
  );
}

const TextBlock = test({
  name: "TextBlock",
  component: _TextBlock,
  parser: parsers.text
});

export default TextBlock;
