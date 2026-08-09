// packages/shared/components/blocks/display/_TextBlock.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { useText } from '@/lib/player/client/useText';
import { renderBlockStatus } from '@/lib/player/client/renderBlockStatus';

// TextBlock uses parsers.text() which returns string kids
function TextBlock(props: RuntimeProps) {
  const { text, ...status } = useText(props);
  const statusView = renderBlockStatus(props, status);

  if (statusView) return statusView;
  return <div>{text}</div>;
}

export default TextBlock;
