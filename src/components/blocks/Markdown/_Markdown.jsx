import React from 'react';
import ReactMarkdown from 'react-markdown';

export function _Markdown( props ) {
  const { kids } = props;
  return <ReactMarkdown>{kids}</ReactMarkdown>;
}
