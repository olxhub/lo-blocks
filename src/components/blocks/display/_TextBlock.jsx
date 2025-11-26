// src/components/blocks/_TextBlock.jsx
'use client';
import React from 'react';

function _TextBlock(props) {
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

export default _TextBlock;
