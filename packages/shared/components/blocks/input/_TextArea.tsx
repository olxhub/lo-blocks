// src/components/blocks/_TextArea.jsx
'use client';

import React from 'react';
import { useReduxInput, useFieldSelector } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

// OLX attributes → React DOM props (rename where conventions differ)
const attrMap: Record<string, string> = { placeholder: 'placeholder', rows: 'rows' };

function _TextArea( props ) {
  // Note: updateValidator is a function, and so can't come from OLX or JSON.
  const { className, fields, updateValidator, ...rest } = props;
  const [value, inputProps] = useReduxInput(
    props, fields.value, '',
    { updateValidator }
  );

  const isReadonly = useFieldSelector(props, fields.readonly, { fallback: props.readonly });

  const { kids } = useKids(props);

  const passthrough = Object.fromEntries(
    Object.entries(attrMap)
      .filter(([olx]) => rest[olx] !== undefined)
      .map(([olx, react]) => [react, rest[olx]])
  );

  return (
    <>
      {kids}
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
