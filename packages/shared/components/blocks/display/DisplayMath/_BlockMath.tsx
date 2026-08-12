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

export default function BlockMath( props: RuntimeProps ) {
  const { text, ...status } = useTextWithTemplate(props);
  const statusView = renderBlockStatus(props, status);

  if (statusView) return statusView;

  let html = '';
  try {
    html = katex.renderToString(text, {
      displayMode: true
    });
  } catch (err) {
    return (
      <DisplayError
        props={props}
        title="BlockMath"
        message="Could not render LaTeX math."
        technical={err instanceof Error ? err.message : String(err)}
      />
    );
  }

  return (
    <>
      <div className="p-4 rounded bg-success-subtle text-success text-center" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
