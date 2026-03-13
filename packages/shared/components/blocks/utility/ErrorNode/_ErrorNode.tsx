// src/components/blocks/ErrorNode/_ErrorNode.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import type { AppError } from '@/lib/errors';

import React from 'react';
import { DisplayError } from '@/lib/util/debug';

/**
 * Block component for rendering errors.
 *
 * Receives an AppError (or subtype like OLXLoadingError) as kids.
 * Formats location and technical details, then delegates to DisplayError.
 *
 * Producers (parsers.ts, useOlxJson.ts, etc.) are responsible for
 * constructing the AppError — this component does not detect formats.
 */
export function _ErrorNode(props: RuntimeProps) {
  const { id, kids } = props;

  if (typeof kids !== 'object' || kids === null || Array.isArray(kids) || !('message' in kids)) {
    return (
      <DisplayError
        props={props}
        name="Unknown Error"
        message="An unknown error occurred during content loading"
        id={`${id}_unknown_error`}
      />
    );
  }

  // After the guard above, kids is { [key: string]: JSONValue } with 'message' present.
  // Cast through unknown: JSONValue values are structurally compatible with AppError
  // at runtime, but TypeScript can't see it (index signature vs named properties).
  const error = kids as unknown as AppError;

  // Format technical details: location + structured/string technical data
  let technicalStr = '';

  if (error.location) {
    const { line, column, file } = error.location;
    if (file) technicalStr += `File: ${file}\n`;
    if (line || column) technicalStr += `Location: Line ${line ?? '?'}, Column ${column ?? '?'}\n`;
  }

  if (error.technical != null) {
    if (technicalStr) technicalStr += '\n';
    technicalStr += typeof error.technical === 'string'
      ? error.technical
      : JSON.stringify(error.technical, null, 2);
  }

  return (
    <DisplayError
      props={props}
      name="Content Error"
      message={error.message}
      technical={technicalStr.trim() || undefined}
      id={`${id}_error`}
    />
  );
}
