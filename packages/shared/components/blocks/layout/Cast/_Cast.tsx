// src/components/blocks/layout/Cast/_Cast.tsx
//
// Cast block — a transparent wrapper that propthreads a cast-of-characters
// to its children via runtime.cast.
//
// Analogous to Noop, but updates the runtime with cast data before
// rendering children. Children (TalkBubble, Chat, TeamDirectory, etc.)
// pick up the cast from props.runtime.cast.
//
'use client';

import React from 'react';
import { useKids } from '@/lib/render';
import { updateCast } from '@/lib/cast';
import type { RuntimeProps } from '@/lib/types';

export default function _Cast(props: RuntimeProps) {
  const { kids } = useKids(updateCast(props));
  return <>{kids}</>;
}
