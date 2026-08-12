'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useTextWithTemplate } from '@/lib/player/client/useText';
import { renderBlockStatus } from '@/lib/player/client/renderBlockStatus';

export default function Html(props: RuntimeProps) {
  const { text, ...status } = useTextWithTemplate(props);
  const sanitized = useMemo(() => {
    // Avoid an empty wrapper for indentation-only CDATA/text.
    if (!text.trim()) return '';
    return DOMPurify.sanitize(text);
  }, [text]);

  const statusView = renderBlockStatus(props, status);
  if (statusView) return statusView;
  if (!sanitized) return null;

  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
