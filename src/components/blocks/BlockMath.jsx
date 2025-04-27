import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import * as parsers from '@/lib/olx/parsers';
import { dev } from '../blocks';
import { Trace } from '@/lib/debug';

function _BlockMath({ kids, url_name }) {
  const latex = kids
    ?.filter(k => k && k.type === 'text')
    .map(k => k.text)
    .join(' ')
    .trim();

  let html = '';
  try {
    html = katex.renderToString(latex, {
      displayMode: true
    });
  } catch (err) {
    console.error('KaTeX render error', err);
  }

  return (
    <>
      <Trace>[BlockMath / (url_name: {url_name || 'n/a'})]</Trace>
      <div className="p-4 rounded bg-green-50 text-green-900 text-center" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

const BlockMath = dev({
  name: 'BlockMath',
  component: _BlockMath,
  parser: parsers.text,
  description: 'Displays a centered LaTeX math equation as a block element.'
});

export default BlockMath;
