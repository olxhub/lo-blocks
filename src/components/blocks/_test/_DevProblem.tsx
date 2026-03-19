// src/components/blocks/test/_DevProblem.jsx
'use client';

import React from 'react';
import { useKids } from '@/lib/render';

export function _DevProblem(props) {
  const { kids } = useKids(props);
  return (
    <div className="border p-4 space-y-2">
      {kids}
    </div>
  );
}
