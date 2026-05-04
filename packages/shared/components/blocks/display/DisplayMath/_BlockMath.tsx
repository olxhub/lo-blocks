'use client';
import React from 'react';
import katex from 'katex';
import type { RuntimeProps } from '@/lib/types';
if (typeof window !== 'undefined') {
  import('katex/dist/katex.min.css');
}
import { useTextContent } from '@/lib/state/redux';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';

export function _BlockMath( props: RuntimeProps ) {
  const { text, loading } = useTextContent(props);

  if (loading) {
    return <Spinner />;
  }

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
