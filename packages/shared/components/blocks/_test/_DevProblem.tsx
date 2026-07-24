// packages/shared/components/blocks/_test/_DevProblem.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useKids } from '@/lib/player/client/render';

export default function DevProblem(props: RuntimeProps) {
  const { kids } = useKids(props);
  return (
    <div className="border p-4 space-y-2">
      {kids}
    </div>
  );
}
