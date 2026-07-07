// packages/shared/components/blocks/input/_LineInput.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useReduxInput } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

const allowedAttrs = ['min', 'max', 'placeholder', 'type', 'step'];

export default function LineInput( props: RuntimeProps ) {
  const { fields, updateValidator, ...rest } = props;

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
      <input
        {...inputProps}
        {...passthrough}
        className="border rounded px-2"
      />
      <DisplayAnswer props={props} />
    </>
  );
}
