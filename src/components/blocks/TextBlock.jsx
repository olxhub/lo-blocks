// src/components/blocks/TextBlock.jsx
import React from 'react';

import * as parsers from '@/lib/content/parsers';
// DebugWrapper will render debug details globally
import { test } from '@/lib/blocks';

function _TextBlock( props ) {
  const { kids } = props;

  /*** HACK HACK HACK ***/
  // This works around a bug where CapaProblem doesn't use block parsers correctly
  if (Array.isArray(kids) && kids.length > 0) {
    // If kids contains objects with type 'text', render the text content
    return (
      <div>
        {kids.map((kid, index) => {
          if (typeof kid === 'object' && kid.type === 'text') {
            return <span key={index}>{kid.text}</span>;
          }
          return typeof kid === 'string' ? kid : JSON.stringify(kid);
        })}
      </div>
    );
  }
  /*** end of hack ***/

  return <div>{kids}</div>;
}

const TextBlock = test({
  ...parsers.text(),
  name: "TextBlock",
  description: 'Simple text container for testing and development',
  component: _TextBlock
});

export default TextBlock;
