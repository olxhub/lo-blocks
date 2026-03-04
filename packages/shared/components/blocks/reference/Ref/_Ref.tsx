'use client';

// src/components/blocks/_Ref.tsx
import React from 'react';
import { useValue } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';

const VALID_FORMATS = ['code'];

export default function _Ref(props) {
  const { visible = true, fallback = '', format } = props;

  // Call Ref's own selectValue via useValue - this is the single source of truth
  // for value formatting, field access, and validation
  const { value, loading, error } = useValue(props, props.id, { fallback });

  if (String(visible) === 'false') {
    // Still subscribe to value but render nothing
    return <></>;
  }

  if (loading) {
    return <Spinner>Loading reference...</Spinner>;
  }

  if (error) {
    return <DisplayError props={props} name="Ref" message={error} />;
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