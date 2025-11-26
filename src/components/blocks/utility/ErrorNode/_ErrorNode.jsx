// src/components/blocks/ErrorNode/ErrorNode.jsx
'use client';

import React from 'react';
import { DisplayError } from '@/lib/util/debug';

export function _ErrorNode(props) {
  const { id, kids } = props;

  // Extract error information from the parsed content
  const errorInfo = kids?.parsed?.error ? kids.parsed : null;
  const parseError = props.parseError;

  if (!errorInfo && !parseError) {
    return (
      <DisplayError
        props={props}
        name="Unknown Error"
        message="An unknown error occurred during content loading"
        id={`${id}_unknown_error`}
      />
    );
  }

  if (errorInfo) {
    // PEG parsing error with detailed information
    // TODO: Make generic for any error
    // We probably want some error type, and then to dispatch on it, or similar?
    const { message, location, expected, found, name } = errorInfo;

    let technicalDetails = `Error Type: ${name}\n`;

    if (location && (location.line || location.column)) {
      technicalDetails += `Location: Line ${location.line || '?'}, Column ${location.column || '?'}\n`;
    }

    if (found !== null && found !== undefined) {
      technicalDetails += `Found: "${found}"\n`;
    }

    if (expected && expected.length > 0) {
      technicalDetails += `Expected: ${expected.map(e => `"${e.description || e}"`).join(', ')}\n`;
    }

    return (
      <DisplayError
        props={props}
        name="Content Parsing Error"
        message={message || 'Failed to parse content'}
        technical={technicalDetails.trim()}
        id={`${id}_parse_error`}
      />
    );
  }

  // Fallback for other error types
  return (
    <DisplayError
      props={props}
      name="Content Error"
      message="An error occurred while processing this content"
      technical="Check console for more details"
      id={`${id}_content_error`}
    />
  );
}
