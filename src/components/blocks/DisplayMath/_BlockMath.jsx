import React from 'react';
import katex from 'katex';
if (typeof window !== 'undefined') {
  import('katex/dist/katex.min.css');
}
import { Trace } from '@/lib/debug';

export function _BlockMath( props ) {
  const { kids, url_name } = props;
  let html = '';
  try {
    html = katex.renderToString(kids, {
      displayMode: true
    });
  } catch (err) {
    console.error('KaTeX render error', err);
  }

  return (
    <>
      <Trace props = { props }/>
      <div className="p-4 rounded bg-green-50 text-green-900 text-center" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
