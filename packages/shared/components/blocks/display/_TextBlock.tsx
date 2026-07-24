// packages/shared/components/blocks/display/_TextBlock.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { assertString } from '@/lib/types/kids';

// TextBlock uses parsers.text() which returns string kids
function _TextBlock(props: RuntimeProps) {
  const { kids } = props;
  assertString(kids);
  return <div>{kids}</div>;
}

export default _TextBlock;
