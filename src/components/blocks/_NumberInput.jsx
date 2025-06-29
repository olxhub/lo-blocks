// src/components/blocks/_NumberInput.jsx
'use client';
import React from 'react';
import { useReduxInput } from '@/lib/state';

function _NumberInput(props) {
  const { className, fields, children } = props;
  const [value, inputProps] = useReduxInput(props, fields.value, '');
  return (
    <>
      {children}
      <input type="number" {...inputProps} className={className ?? 'border rounded px-2'} />
    </>
  );
}

export default _NumberInput;
