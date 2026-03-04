// src/components/blocks/Vertical/_Vertical.jsx
import React from 'react';
import { useKids } from '@/lib/render';

export function _Vertical( props ) {
  const { kids } = useKids(props);
  return (
    <div className="vertical-container">
      {kids}
    </div>
  );
}