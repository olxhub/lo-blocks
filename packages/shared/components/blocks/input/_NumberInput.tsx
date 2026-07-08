// packages/shared/components/blocks/input/_NumberInput.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { useInputField } from '@/lib/state';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

function NumberInput(props: RuntimeProps) {
  const { className, fields, children, min, max, step, placeholder } = props;
  const [value, inputProps] = useInputField(props, fields.value, '');

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

export default NumberInput;
