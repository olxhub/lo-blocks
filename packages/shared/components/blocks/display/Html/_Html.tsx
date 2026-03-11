'use client';

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

export function _Html({ kids }: { kids: any }) {
  let content = kids;
  if (Array.isArray(kids) && kids.length > 0) {
    content = kids.map((kid) => {
      if (typeof kid === 'object' && kid.type === 'text') {
        return kid.text;
      }
      return typeof kid === 'string' ? kid : '';
    }).join('');
  }

  const sanitized = useMemo(() => {
    if (typeof content !== 'string' || !content.trim()) return '';
    return DOMPurify.sanitize(content);
  }, [content]);

  if (!sanitized) return null;

  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
