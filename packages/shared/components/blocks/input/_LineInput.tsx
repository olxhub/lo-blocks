// packages/shared/components/blocks/input/_LineInput.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useInputField } from '@/lib/state';
import { useInputReadOnly } from '@/lib/blocks';
import { useKids } from '@/lib/render';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';

const allowedAttrs = ['min', 'max', 'placeholder', 'type', 'step'];

export default function LineInput( props: RuntimeProps ) {
  const { fields, updateValidator, ...rest } = props;

  const [value, inputProps] = useInputField(
    props, fields.value, '',
    { updateValidator }
  );

  const { kids } = useKids(props);

  // Locked while a related slow grader is grading the submitted snapshot —
  // edits mid-grade would desync the visible answer from the graded one.
  const readOnly = useInputReadOnly(props);

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
        readOnly={readOnly}
        className="border rounded px-2"
      />
      <DisplayAnswer props={props} />
    </>
  );
}
