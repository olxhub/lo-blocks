// src/components/blocks/_TextArea.jsx
'use client';

import React from 'react';
import { useReduxInput } from '@/lib/blocks';
import { renderCompiledKids } from '@/lib/render';

function _TextArea( props ) {
  // Note: updateValidator is a function, and so can't come from OLX or JSON.
  const { className, fields, updateValidator } = props;
  const [value, inputProps] = useReduxInput(
    props, fields.value, '',
    { updateValidator }
  );

  return (
    <>
      {renderCompiledKids( props )}
      <textarea
        {...inputProps}
        className={className || 'large-input'}
      />
    </>
  );
}

export default _TextArea;
