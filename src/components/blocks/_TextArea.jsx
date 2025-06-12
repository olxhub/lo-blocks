'use client';

import React from 'react';
import { useReduxInput } from '@/lib/blocks';

function _TextArea( props ) {
  // Note: updateValidator is a function, and so can't come from OLX or JSON.
  const { id, className, children, fields, updateValidator } = props;
  const [value, inputProps] = useReduxInput(id, fields.value, '', { updateValidator } );

  return (
    <>
      {children}
      <textarea
        {...inputProps}
        className={className || 'large-input'}
        required
      />
    </>
  );
}

export default _TextArea;
