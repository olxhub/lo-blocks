'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { isKidArray } from '@/lib/types/kids';

export default function Html({ kids }: RuntimeProps) {
  const sanitized = useMemo(() => {
    let content = kids;
    if (isKidArray(kids) && kids.length > 0) {
      content = kids.map((kid) => {
        if (kid.type === 'text') {
          return kid.text;
        }
        return '';
      }).join('');
    }

    if (typeof content !== 'string' || !content.trim()) return '';
    return DOMPurify.sanitize(content);
  }, [kids]);

  if (!sanitized) return null;

  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
