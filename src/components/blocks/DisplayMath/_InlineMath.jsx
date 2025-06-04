import React from 'react';
import katex from 'katex';
if (typeof window !== 'undefined') {
  import('katex/dist/katex.min.css');
}
import { DisplayError, Trace } from '@/lib/debug';

export function _InlineMath( props ) {
  const { kids, url_name } = props;
  const latex = kids
    ?.filter(k => k && k.type === 'text')
    .map(k => k.text)
    .join(' ')
    .trim();

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
      <Trace props={props}>LaTeX: {latex}</Trace>
      <span className="inline" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
