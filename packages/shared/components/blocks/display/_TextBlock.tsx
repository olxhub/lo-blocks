// src/components/blocks/_TextBlock.jsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import { assertString } from '@/lib/util/kids';

// TextBlock uses parsers.text() which returns string kids
function _TextBlock(props: RuntimeProps) {
  const { kids } = props;
  assertString(kids);
  return <div>{kids}</div>;
}

export default _TextBlock;
