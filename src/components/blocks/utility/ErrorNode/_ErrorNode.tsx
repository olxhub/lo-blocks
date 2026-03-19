// src/components/blocks/ErrorNode/ErrorNode.jsx
'use client';

import React from 'react';
import { DisplayError } from '@/lib/util/debug';

export function _ErrorNode(props) {
  const { id, kids } = props;

  // TODO: Standardize error format across all parsers and error sources.
  // Currently we handle multiple formats which is fragile:
  // 1. Direct error object from PEG parser: kids = { type: 'peg_error', message, location, technical }
  // 2. Wrapped format: kids = { parsed: { error: true, ... } }
  // Should unify on a single OLXLoadingError structure passed consistently.
  const errorInfo = kids?.type === 'peg_error' ? kids
    : kids?.parsed?.error ? kids.parsed
    : null;
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
    const { message, location, technical } = errorInfo;
    // Support both direct fields and nested technical object
    const expected = errorInfo.expected || technical?.expected;
    const found = errorInfo.found || technical?.found;
    const name = errorInfo.name || technical?.name || errorInfo.type;

    let technicalDetails = `Error Type: ${name}\n`;

    if (location && (location.line || location.column)) {
      technicalDetails += `Location: Line ${location.line || '?'}, Column ${location.column || '?'}\n`;
    }

    if (found !== null && found !== undefined) {
      technicalDetails += `Found: "${found}"\n`;
    }

    if (expected && expected.length > 0) {
      const formatExpected = (e) => {
        if (typeof e === 'string') return e;
        if (e?.description) return e.description;
        if (e?.text) return e.text;
        if (e?.type) return e.type;
        return JSON.stringify(e);
      };
      technicalDetails += `Expected: ${expected.map(e => `"${formatExpected(e)}"`).join(', ')}\n`;
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
