// src/components/blocks/_NumberInput.jsx
'use client';
import React from 'react';
import { useReduxInput } from '@/lib/state';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

function _NumberInput(props) {
  const { className, fields, children, min, max, step, placeholder } = props;
  const [value, inputProps] = useReduxInput(props, fields.value, '');

  return (
    <>
      {children}
      <input
        type="number"
        {...inputProps}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className={className ?? 'border rounded px-2'}
      />
      <DisplayAnswer props={props} />
    </>
  );
}

export default _NumberInput;
