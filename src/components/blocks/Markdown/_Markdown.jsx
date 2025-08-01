import React from 'react';
import ReactMarkdown from 'react-markdown';

export function _Markdown( props ) {
  const { kids } = props;
  // TODO: Ignore common indent. These often have a large baseline indent due to XML formatting.
  return <ReactMarkdown>{kids}</ReactMarkdown>;
}
