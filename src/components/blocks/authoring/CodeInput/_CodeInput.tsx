// src/components/blocks/authoring/CodeInput/_CodeInput.tsx
//
// CodeMirror editor wired to Redux. Value is stored in the component's
// `value` field so other blocks (e.g., OlxSlot) can read it via
// componentFieldByName or fieldSelector.
//
'use client';

import React, { useCallback } from 'react';
import { useFieldState, useValue } from '@/lib/state';
import CodeEditor from '@/components/common/CodeEditor';

function _CodeInput(props) {
  const { id, fields, language = 'olx', height = '300px', theme = 'light' } = props;

  const [, setValue] = useFieldState(props, fields.value, null);
  const value = useValue(props, id, { fallback: '' });

  // CodeEditor's onChange passes the string directly (not a DOM event)
  const onChange = useCallback((newValue: string) => {
    setValue(newValue);
  }, [setValue]);

  return (
    <div className="code-input">
      <CodeEditor
        value={value}
        onChange={onChange}
        language={language}
        height={height}
        theme={theme}
      />
    </div>
  );
}

export default _CodeInput;
