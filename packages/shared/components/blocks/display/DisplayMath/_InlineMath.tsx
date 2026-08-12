'use client';
import React from 'react';
import katex from 'katex';
import type { RuntimeProps } from '@/lib/types';
if (typeof window !== 'undefined') {
  import('katex/dist/katex.min.css');
}
import { useTextWithTemplate } from '@/lib/player/client/useText';
import { renderBlockStatus } from '@/lib/player/client/renderBlockStatus';
import { DisplayError } from '@/lib/util/debug';

export default function InlineMath( props: RuntimeProps ) {
  const { text, ...status } = useTextWithTemplate(props);
  const latex = text.trim();
  const statusView = renderBlockStatus(props, status);

  if (statusView) return statusView;

  let html = '';
  try {
    html = katex.renderToString(latex);
  } catch (err) {
    return (
      <DisplayError
        props = { props }
        title="InlineMath"
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
