// packages/shared/components/blocks/display/DemandHints/_Hint.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useKids } from '@/lib/render';

export default function _Hint(props: RuntimeProps) {
  const { kids } = useKids(props);
  return <>{kids}</>;
}
