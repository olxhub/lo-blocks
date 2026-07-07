// packages/shared/components/blocks/specialized/LiquidTemplate/_LiquidTemplate.tsx
import React from 'react';
import { useKids } from '@/lib/render';
import type { RuntimeProps } from '@/lib/types';

export default function LiquidTemplate(props: RuntimeProps) {
  const { kids } = useKids(props);
  return (
    <div className="liquid-template-container">
      {kids}
    </div>
  );
}
