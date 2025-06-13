// src/components/blocks/_NumberInput.jsx
'use client';
import React from 'react';
import { useReduxInput } from '@/lib/blocks';

function _NumberInput({ id, className, fields, children }) {
  const [value, inputProps] = useReduxInput(id, fields.value, '');
  return (
    <>
      {children}
      <input type="number" {...inputProps} className={className || 'border rounded px-2'} />
    </>
  );
}

export default _NumberInput;
