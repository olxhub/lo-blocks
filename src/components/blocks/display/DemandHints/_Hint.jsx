// src/components/blocks/display/DemandHints/_Hint.jsx
'use client';

import React from 'react';
import { useKids } from '@/lib/render';

export default function _Hint(props) {
  const { kids } = useKids(props);
  return <>{kids}</>;
}
