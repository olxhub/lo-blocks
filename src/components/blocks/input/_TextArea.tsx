// src/components/blocks/_TextArea.jsx
'use client';

import React from 'react';
import { useReduxInput } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

// OLX attributes → React DOM props (rename where conventions differ)
const attrMap: Record<string, string> = { placeholder: 'placeholder', rows: 'rows', readonly: 'readOnly' };

function _TextArea( props ) {
  // Note: updateValidator is a function, and so can't come from OLX or JSON.
  const { className, fields, updateValidator, ...rest } = props;
  const [value, inputProps] = useReduxInput(
    props, fields.value, '',
    { updateValidator }
  );

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
        className={className}
      />
      <DisplayAnswer props={props} />
    </>
  );
}

export default _TextArea;
