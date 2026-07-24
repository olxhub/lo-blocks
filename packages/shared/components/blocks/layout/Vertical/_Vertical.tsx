// packages/shared/components/blocks/layout/Vertical/_Vertical.tsx
import React from 'react';
import { useKids } from '@/lib/player/client/render';
import type { RuntimeProps } from '@/lib/types';

export default function Vertical( props: RuntimeProps ) {
  const { kids } = useKids(props);
  return (
    <div className="vertical-container">
      {kids}
    </div>
  );
}