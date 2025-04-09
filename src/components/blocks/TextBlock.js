import React from 'react';

import * as parsers from '@/lib/olx/parsers';
import { Trace } from '@/lib/debug';
import { test } from '../blocks.js';

function _TextBlock({ kids, url_name }) {
  const content = Array.isArray(kids)
    ? kids.map((child, i) => {
        if (typeof child === 'string') return child;
        if (React.isValidElement(child)) return child;
        if (child.type === 'text') return child.text;
        if (child.type === 'xml') return <pre key={i}>{child.xml}</pre>;

        return (
          <pre key={i} className="text-red-500 text-xs">
            [Unhandled child: {JSON.stringify(child)}]
          </pre>
        );
      })
    : kids;

  return (
    <div className="p-4 rounded bg-blue-50 text-blue-900">
      <Trace>[TextBlock / (url_name: {url_name || 'n/a'})]</Trace>
     {content}
    </div>
  );
}

const TextBlock = test({
  name: "TextBlock",
  component: _TextBlock,
  parser: parsers.text
});

export default TextBlock;
