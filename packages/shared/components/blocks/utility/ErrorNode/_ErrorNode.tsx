// packages/shared/components/blocks/utility/ErrorNode/_ErrorNode.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { DisplayError } from '@/lib/util/debug';

/**
 * Block component for rendering errors.
 *
 * Receives an AppError-shaped payload through attributes.
 * Formats location and technical details, then delegates to DisplayError.
 */
export function _ErrorNode(props: RuntimeProps) {
  const { id, title = 'Error', message, technical, stack, location } = props;

  if (typeof message !== 'string') {
    return (
      <DisplayError
        props={props}
        title="Unknown Error"
        message="An unknown error occurred during content loading"
        id={`${id}_unknown_error`}
      />
    );
  }

  // Format technical details: location + structured/string technical data
  let technicalStr = '';

  if (location) {
    const { line, column, provenance } = location;
    if (provenance && provenance.length > 0) {
      // `provenance` is the set of sources this error can be traced
      // to. Producers should ideally narrow it to the source(s) that
      // actually contain the problem — e.g. an XML parse error should
      // be attributed to the .olx, a PEG error to the .chatpeg — but
      // passing the whole set is an acceptable default. Render
      // whatever arrived, one per line.
      technicalStr += `Source:\n  ${provenance.join('\n  ')}\n`;
    }
    if (line || column) technicalStr += `Location: Line ${line ?? '?'}, Column ${column ?? '?'}\n`;
  }

  if (technical != null) {
    if (technicalStr) technicalStr += '\n';
    technicalStr += typeof technical === 'string'
      ? technical
      : JSON.stringify(technical, null, 2);
  }

  if (stack) {
    if (technicalStr) technicalStr += '\n';
    technicalStr += stack;
  }

  return (
    <DisplayError
      props={props}
      title={title}
      message={message}
      technical={technicalStr.trim() || undefined}
      id={`${id}_error`}
    />
  );
}
