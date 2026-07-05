'use client';
// packages/shared/components/blocks/display/Notice/_Notice.tsx
//
// Thin block wrapper over the shared Notice component — see Notice.ts.

import React from 'react';
import type { RuntimeProps } from '@/lib/types';
import Notice from '@/components/common/Notice';

export default function _Notice(props: RuntimeProps) {
  const content = typeof props.content === 'string' ? props.content : undefined;
  return <Notice content={content} />;
}
