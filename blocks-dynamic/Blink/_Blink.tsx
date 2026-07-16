// blocks-dynamic/Blink/_Blink.tsx
'use client';
import React from 'react';
import type { RuntimeProps } from '@/lib/types';
import './blink.css';

/**
 * Renders the block's text content (from parsers.text(), delivered as a
 * string on `kids`) with a CSS blink animation.
 */
export default function _Blink(props: RuntimeProps) {
  const { kids } = props;
  return <span className="lo-blink">{kids}</span>;
}
