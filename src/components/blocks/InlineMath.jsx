import React from 'react';
import katex from 'katex';
if (typeof window !== 'undefined') {
  import('katex/dist/katex.min.css');
}
import * as parsers from '@/lib/olx/parsers';
import { dev } from '@/lib/blocks';
import { DisplayError, Trace } from '@/lib/debug';

function _InlineMath({ kids, url_name }) {
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
        name="InlineMath"
        message="Could not render LaTeX math."
        technical={err.message}
        data={{ latex }}
      />
    );
  }

  return (
    <>
      <Trace>[InlineMath / (url_name: {url_name || 'n/a'})]</Trace>
      <Trace>LaTeX: {latex}</Trace>
      <span className="inline" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

const InlineMath = dev({
  name: 'InlineMath',
  component: _InlineMath,
  parser: parsers.text,
  description: 'Renders a short LaTeX math expression inline within text.'
});

export default InlineMath;
