// packages/shared/components/blocks/layout/Vertical/_Vertical.tsx
import React from 'react';
import { useKids } from '@/lib/render';
import type { RuntimeProps } from '@/lib/types';

export function _Vertical( props: RuntimeProps ) {
  const { kids } = useKids(props);
  return (
    <div className="vertical-container">
      {kids}
    </div>
  );
}