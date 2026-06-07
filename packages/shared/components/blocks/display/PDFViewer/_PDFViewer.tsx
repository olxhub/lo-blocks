// packages/shared/components/blocks/display/PDFViewer/_PDFViewer.tsx
//
// Uses the browser's built-in PDF viewer via <iframe>.
// Path resolution follows the same conventions as Image (see Image block docs).

'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { resolveContentPath } from '@/lib/content/contentPaths';

function _PDFViewer(props: RuntimeProps) {
  const { src, width, height } = props;

  if (!src) {
    return <div className="text-error border border-error p-2 rounded">
      PDF error: src attribute required
    </div>;
  }

  try {
    const finalSrc = resolveContentPath(src)!;

    return (
      <iframe
        src={finalSrc}
        width={width || '100%'}
        height={height || '600px'}
        style={{ border: 'none' }}
        title="PDF document"
      />
    );
  } catch (error) {
    return <div className="text-error border border-error p-2 rounded">
      PDF error: {error.message}
    </div>;
  }
}

export default _PDFViewer;
