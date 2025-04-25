'use client';

import React, { useEffect } from 'react';
import { useComponentSelector } from 'lo_event/lo_event/lo_assess/selectors.js';
import { fixCursor, handleInputChange } from './inputHelpers.js';

function _TextInput({ id, className, children }) {
  const value = useComponentSelector(id, s => s?.value ?? '');
  const selectionStart = useComponentSelector(id, s => s?.selectionStart ?? 1);
  const selectionEnd = useComponentSelector(id, s => s?.selectionEnd ?? 1);

  useEffect(fixCursor(id, selectionStart, selectionEnd), [value]);

  return (
    <>
      {children}
      <textarea
        name={id}
        className={className || 'large-input'}
        required
        value={value}
        onChange={handleInputChange(id)}
      />
    </>
  );
}

export default _TextInput;
