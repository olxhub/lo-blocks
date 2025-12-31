// src/components/blocks/_TextArea.jsx
'use client';

import React from 'react';
import { useReduxInput } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

function _TextArea( props ) {
  // Note: updateValidator is a function, and so can't come from OLX or JSON.
  const { className, fields, updateValidator } = props;
  const [value, inputProps] = useReduxInput(
    props, fields.value, '',
    { updateValidator }
  );

  const { kids } = useKids(props);

  return (
    <>
      {kids}
      <textarea
        {...inputProps}
        className={className ?? 'large-input'}
      />
      <DisplayAnswer props={props} />
    </>
  );
}

export default _TextArea;
