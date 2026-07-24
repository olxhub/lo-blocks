// packages/shared/components/blocks/input/_TextArea.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useInputField, useFieldSelector } from '@/lib/state';
import { useInputReadOnly } from '@/lib/player/inputInteraction';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

// OLX attributes → React DOM props (rename where conventions differ)
const attrMap: Record<string, string> = { placeholder: 'placeholder', rows: 'rows' };

function TextArea( props: RuntimeProps ) {
  // Note: updateValidator is a function, and so can't come from OLX or JSON.
  const { className, fields, kids, updateValidator, ...rest } = props;

  // If children text is provided, use it as the initial value
  const initialValue = (typeof kids === 'string' && kids.trim()) ? kids.trim() : '';

  const [value, inputProps] = useInputField(
    props, fields.value, initialValue,
    { updateValidator }
  );

  const isReadonly = useFieldSelector(props, fields.readonly, { fallback: props.readonly });
  // Also locked while a related slow grader is grading the snapshot.
  const gradingLocked = useInputReadOnly(props);

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
        readOnly={isReadonly || gradingLocked}
        className={className}
      />
      <DisplayAnswer props={props} />
    </>
  );
}

export default TextArea;
