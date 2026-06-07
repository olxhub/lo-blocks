// src/components/blocks/authoring/CodeInput/_CodeInput.tsx
//
// EXPERIMENTAL / PROTOTYPE
//
// CodeMirror editor wired to Redux. API will likely change.
//
'use client';
import type { RuntimeProps } from '@/lib/types';

import { useCallback } from 'react';
import { useFieldState, useValue } from '@/lib/state';
import CodeEditor from '@/components/common/CodeEditor';

function _CodeInput(props: RuntimeProps) {
  const { id, fields, language = 'olx', height = '300px' } = props;

  const [, setValue] = useFieldState(props, fields.value, null);
  const { value } = useValue(props, { fallback: null });

  // CodeEditor's onChange passes the string directly (not a DOM event)
  const onChange = useCallback((newValue: string) => {
    setValue(newValue);
  }, [setValue]);

  return (
    <CodeEditor
      value={value ?? ''}
      onChange={onChange}
      language={language}
      height={height}
    />
  );
}

export default _CodeInput;
