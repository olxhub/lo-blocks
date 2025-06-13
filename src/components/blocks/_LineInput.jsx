// src/components/blocks/_LineInput.jsx
'use client';

import React from 'react';
import { useReduxInput } from '@/lib/blocks';
import { renderCompiledKids } from '@/lib/render';

const allowedAttrs = ['min', 'max', 'placeholder', 'type', 'step'];

export default function _LineInput( props ) {
  const { id, fields, updateValidator, ...rest } = props;

  const [value, inputProps] = useReduxInput(
    id, fields.value, '',
    { updateValidator }
  );

  const passthrough = {};
  for (const key of allowedAttrs) {
    if (rest[key] !== undefined) passthrough[key] = rest[key];
  }

  return (
    <>
      {renderCompiledKids( props )}
      <input
        {...inputProps}
        {...passthrough}
        className={'border rounded px-2'}
      />
    </>
  );
}
