// src/components/blocks/DisplayMath/_InlineMath.jsx
import React from 'react';
import katex from 'katex';
if (typeof window !== 'undefined') {
  import('katex/dist/katex.min.css');
}
import { DisplayError } from '@/lib/util/debug';

export function _InlineMath( props ) {
  const { kids } = props;
  const latex = typeof kids === 'string' ? kids.trim() : '';

  let html = '';
  try {
    html = katex.renderToString(latex);
  } catch (err) {
    return (
      <DisplayError
        props = { props }
        name="InlineMath"
        message="Could not render LaTeX math."
        technical={err.message}
        data={{ latex }}
      />
    );
  }

  return (
    <>
      <span className="inline" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
