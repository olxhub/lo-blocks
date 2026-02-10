// src/components/blocks/_TextArea.jsx
'use client';

import React from 'react';
import { useReduxInput } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

const allowedAttrs = ['placeholder', 'rows', 'readonly'];

function _TextArea( props ) {
  // Note: updateValidator is a function, and so can't come from OLX or JSON.
  const { className, fields, updateValidator, ...rest } = props;
  const [value, inputProps] = useReduxInput(
    props, fields.value, '',
    { updateValidator }
  );

  const { kids } = useKids(props);

  const passthrough = Object.fromEntries(
    allowedAttrs
      .filter(key => rest[key] !== undefined)
      .map(key => [key, rest[key]])
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
