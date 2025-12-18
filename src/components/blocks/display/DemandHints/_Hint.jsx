// src/components/blocks/display/DemandHints/_Hint.jsx
'use client';

import React from 'react';
import { renderCompiledKids } from '@/lib/render';

export default function _Hint(props) {
  const { kids } = props;
  return <>{renderCompiledKids(props, kids)}</>;
}
