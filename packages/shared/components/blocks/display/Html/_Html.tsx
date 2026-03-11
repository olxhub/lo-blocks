'use client';

import React from 'react';

export function _Html(props) {
  const { kids } = props;

  let content = kids;
  if (Array.isArray(kids) && kids.length > 0) {
    content = kids.map((kid) => {
      if (typeof kid === 'object' && kid.type === 'text') {
        return kid.text;
      }
      return typeof kid === 'string' ? kid : '';
    }).join('');
  }

  if (typeof content !== 'string' || !content.trim()) {
    return null;
  }

  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}
