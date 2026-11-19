// packages/shared/components/blocks/authoring/CodeInput/_CodeInput.tsx
//
// EXPERIMENTAL / PROTOTYPE
//
// CodeMirror editor wired to Redux. API will likely change.
//
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useCallback } from 'react';
import { useFieldState, useValue } from '@/lib/state';
import CodeEditor from '@/components/common/CodeEditor';
import { useInputReadOnly } from '@/lib/player/inputInteraction';

function CodeInput(props: RuntimeProps) {
  const { id, fields, language = 'olx', height = '300px' } = props;

  const [, setValue] = useFieldState(props, fields.value, null);
  const { value } = useValue(props, { fallback: null });
  const readOnly = useInputReadOnly(props);

  // CodeEditor's onChange passes the string directly (not a DOM event)
  const onChange = useCallback((newValue: string) => {
    if (readOnly) return;
    setValue(newValue);
  }, [readOnly, setValue]);

  return (
    <CodeEditor
      value={value ?? ''}
      onChange={onChange}
      readOnly={readOnly}
      language={language}
      height={height}
    />
  );
}

export default CodeInput;
