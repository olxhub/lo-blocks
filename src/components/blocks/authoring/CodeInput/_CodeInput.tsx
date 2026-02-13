// src/components/blocks/authoring/CodeInput/_CodeInput.tsx
//
// EXPERIMENTAL / PROTOTYPE
//
// CodeMirror editor wired to Redux. API will likely change.
//
'use client';

import React, { useCallback } from 'react';
import { useFieldState, useValue } from '@/lib/state';
import CodeEditor from '@/components/common/CodeEditor';

function _CodeInput(props) {
  const { id, fields, language = 'olx', height = '300px', theme = 'light' } = props;

  const [, setValue] = useFieldState(props, fields.value, null);
  const value = useValue(props, id, { fallback: null });

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
      theme={theme}
    />
  );
}

export default _CodeInput;
