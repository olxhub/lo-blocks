'use client';

// src/components/blocks/_Ref.jsx
import React from 'react';
import { useValue } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';

const VALID_FORMATS = ['code'];

export default function _Ref(props) {
  const { visible = true, fallback = '', format } = props;

  // Call Ref's own getValue via useValue - this is the single source of truth
  // for value formatting, field access, and validation
  const value = useValue(props, props.id, { fallback });

  if (String(visible) === 'false') {
    // Still subscribe to value but render nothing
    return <></>;
  }

  // Check if getValue returned an error object (objects are system-generated, strings are user data)
  if (typeof value === 'object' && value?.error) {
    return <DisplayError props={props} name="Ref" message={value.message} />;
  }

  // Validate format attribute if provided
  if (format && !VALID_FORMATS.includes(format)) {
    return <DisplayError props={props} name="Ref" message={`Unknown format "${format}". Valid options: ${VALID_FORMATS.join(', ')}`} />;
  }

  if (format === 'code') {
    return <code style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{value}</code>;
  }

  return <span>{value}</span>;
}