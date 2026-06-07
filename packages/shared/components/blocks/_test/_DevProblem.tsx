// src/components/blocks/test/_DevProblem.jsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import { useKids } from '@/lib/render';

export function _DevProblem(props: RuntimeProps) {
  const { kids } = useKids(props);
  return (
    <div className="border p-4 space-y-2">
      {kids}
    </div>
  );
}
