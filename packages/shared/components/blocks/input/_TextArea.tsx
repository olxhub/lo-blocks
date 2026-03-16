// src/components/blocks/_TextArea.jsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useInputField, useFieldSelector } from '@/lib/state';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

// OLX attributes → React DOM props (rename where conventions differ)
const attrMap: Record<string, string> = { placeholder: 'placeholder', rows: 'rows' };

function _TextArea( props: RuntimeProps ) {
  // Note: updateValidator is a function, and so can't come from OLX or JSON.
  const { className, fields, kids, updateValidator, ...rest } = props;

  // If children text is provided, use it as the initial value
  const initialValue = (typeof kids === 'string' && kids.trim()) ? kids.trim() : '';

  const [value, inputProps] = useInputField(
    props, fields.value, initialValue,
    { updateValidator }
  );

  const isReadonly = useFieldSelector(props, fields.readonly, { fallback: props.readonly });

  const passthrough = Object.fromEntries(
    Object.entries(attrMap)
      .filter(([olx]) => rest[olx] !== undefined)
      .map(([olx, react]) => [react, rest[olx]])
  );

  return (
    <>
      <textarea
        {...inputProps}
        {...passthrough}
        readOnly={isReadonly}
        className={className}
      />
      <DisplayAnswer props={props} />
    </>
  );
}

export default _TextArea;
