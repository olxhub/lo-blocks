'use client';
import katex from 'katex';
import type { RuntimeProps } from '@/lib/types';
if (typeof window !== 'undefined') {
  import('katex/dist/katex.min.css');
}
import { useTextContent } from '@/lib/state/redux';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';

export function _InlineMath( props: RuntimeProps ) {
  const { text, loading } = useTextContent(props);
  const latex = text.trim();

  if (loading) {
    return <Spinner />;
  }

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
