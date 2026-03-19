// src/components/blocks/display/PDFViewer/_PDFViewer.tsx
//
// Uses the browser's built-in PDF viewer via <iframe>.
// Path resolution follows the same conventions as Image (see Image block docs).

'use client';
import React from 'react';
import { resolveContentPath } from '@/lib/util';

function _PDFViewer(props) {
  const { src, width, height } = props;

  if (!src) {
    return <div className="text-red-500 border border-red-300 p-2 rounded">
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
    return <div className="text-red-500 border border-red-300 p-2 rounded">
      PDF error: {error.message}
    </div>;
  }
}

export default _PDFViewer;
