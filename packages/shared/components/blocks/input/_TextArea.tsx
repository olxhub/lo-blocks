// packages/shared/components/blocks/input/_TextArea.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useInputField, useFieldSelector } from '@/lib/state';
import { useInputReadOnly } from '@/lib/player/inputInteraction';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';
import { useText } from '@/lib/player/client/useText';
import { renderBlockStatus } from '@/lib/player/client/renderBlockStatus';

// OLX attributes → React DOM props (rename where conventions differ)
const attrMap: Record<string, string> = { placeholder: 'placeholder', rows: 'rows' };

function TextArea( props: RuntimeProps ) {
  // Note: updateValidator is a function, and so can't come from OLX or JSON.
  const { className, fields, updateValidator, ...rest } = props;
  const { text, ...status } = useText(props);

  // If children text is provided, use it as the initial value
  const initialValue = text.trim();

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

  // Keep all hooks above these status branches. Text is an initial-value
  // fallback; once the learner writes the field, stored state continues to win.
  const statusView = renderBlockStatus(props, status);
  if (statusView) return statusView;

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
