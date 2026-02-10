// src/components/common/ExpandIcon.tsx
//
// RTL-aware expand/collapse indicator.
// Renders a triangle pointing inline-end when collapsed, down when expanded.
// In RTL mode, the collapsed arrow points left instead of right.
'use client';

import React from 'react';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';

interface ExpandIconProps {
  expanded: boolean;
  className?: string;
}

export default function ExpandIcon({ expanded, className }: ExpandIconProps) {
  const { dir } = useLocaleAttributes();
  const isRtl = dir === 'rtl';

  const char = expanded ? '▼' : isRtl ? '◀' : '▶';
  return <span className={className} aria-hidden="true">{char}</span>;
}
