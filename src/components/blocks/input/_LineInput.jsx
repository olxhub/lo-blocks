// src/components/blocks/_LineInput.jsx
'use client';

import React from 'react';
import { useReduxInput } from '@/lib/state';
import { renderCompiledKids } from '@/lib/render';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

const allowedAttrs = ['min', 'max', 'placeholder', 'type', 'step'];

export default function _LineInput( props ) {
  const { fields, updateValidator, ...rest } = props;

  const [value, inputProps] = useReduxInput(
    props, fields.value, '',
    { updateValidator }
  );

  const passthrough = Object.fromEntries(
    allowedAttrs
      .filter(key => rest[key] !== undefined)
      .map(key => [key, rest[key]])
  );

  return (
    <>
      {renderCompiledKids( props )}
      <input
        {...inputProps}
        {...passthrough}
        className="border rounded px-2"
      />
      <DisplayAnswer props={props} />
    </>
  );
}
