// src/components/blocks/Vertical/_Vertical.jsx
import React from 'react';
import { renderCompiledKids } from '@/lib/render';

export function _Vertical( props ) {
  return (
    <div className="vertical-container">
      {renderCompiledKids({ ...props, kids: props.kids })}
    </div>
  );
}