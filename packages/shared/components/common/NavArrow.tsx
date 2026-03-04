// src/components/common/NavArrow.tsx
//
// RTL-aware directional arrow for prev/next navigation.
// "forward" points in the reading direction (right in LTR, left in RTL).
// "back" points opposite to the reading direction.
'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';

interface NavArrowProps {
  direction: 'forward' | 'back';
  className?: string;
}

export default function NavArrow({ direction, className = 'w-4 h-4' }: NavArrowProps) {
  const { dir } = useLocaleAttributes();
  const isRtl = dir === 'rtl';

  // forward = inline-end, back = inline-start
  const pointRight = (direction === 'forward') !== isRtl;

  return pointRight
    ? <ChevronRight className={className} />
    : <ChevronLeft className={className} />;
}
