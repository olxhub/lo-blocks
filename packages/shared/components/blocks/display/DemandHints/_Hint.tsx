// src/components/blocks/display/DemandHints/_Hint.jsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import { useKids } from '@/lib/render';

export default function _Hint(props: RuntimeProps) {
  const { kids } = useKids(props);
  return <>{kids}</>;
}
