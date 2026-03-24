// src/components/common/Avatar.tsx
//
// Shared avatar component used by ChatComponent, TalkBubble, and
// any future component that needs to display a speaker/participant.
//
// Supports two styles:
//   'illustrated' (default) - DiceBear/Open Peeps generated face from seed
//   'initials'              - Colored circle with letter initials
//
// DiceBear options (face, head, skinColor, etc.) can be passed through
// via the `options` prop for per-character or per-line customization.
//
'use client';

import React, { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import * as openPeeps from '@dicebear/open-peeps';
import { resolveContentPath } from '@/lib/content/contentPaths';
import type { OpenPeeps, AvatarStyleValue } from '@/lib/avatar/openpeeps';

interface AvatarProps {
  name?: string;
  src?: string;
  seed?: string;
  style?: 'illustrated' | 'initials';
  options?: OpenPeeps;
  size?: number;
}

const INITIALS_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500',
  'bg-red-500', 'bg-teal-500', 'bg-orange-500'
];

function getInitialsColor(name: string | undefined) {
  const hash = Array.from(name || '').reduce(
    (acc, ch) => ch.charCodeAt(0) + ((acc << 5) - acc),
    0
  );
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
}

function getInitials(name: string | undefined) {
  if (!name) return '?';
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function Avatar({ name, src, seed, style = 'illustrated', options, size = 32 }: AvatarProps) {
  const generatedSvg = useMemo(() => {
    if (src || style === 'initials') return undefined;
    // DiceBear expects array values for enumerated options like face, head, etc.
    // Our schema allows singles; coerce to arrays before passing through.
    const dicebearOptions: Record<string, any> = {
      seed: seed || name || 'unknown',
      size,
      ...options,
    };
    for (const key of ['face', 'head', 'accessories', 'facialHair', 'mask']) {
      if (typeof dicebearOptions[key] === 'string') {
        dicebearOptions[key] = [dicebearOptions[key]];
      }
    }
    const avatar = createAvatar(openPeeps, dicebearOptions);
    return avatar.toDataUri();
  }, [name, src, seed, style, options, size]);

  // Explicit image URL — highest priority
  if (src) {
    const resolvedSrc = resolveContentPath(src) ?? src;
    return (
      <img
        src={resolvedSrc}
        alt={name || 'Speaker'}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  // Initials style — colored circle with letters
  if (style === 'initials') {
    const bgColor = getInitialsColor(name);
    const fontSize = Math.max(10, Math.round(size * 0.4));
    return (
      <div
        className={`rounded-full flex items-center justify-center text-white font-semibold ${bgColor}`}
        style={{ width: size, height: size, fontSize }}
      >
        {getInitials(name)}
      </div>
    );
  }

  // Illustrated style — DiceBear Open Peeps
  return (
    <img
      src={generatedSvg}
      alt={name || 'Speaker'}
      className="rounded-full"
      style={{ width: size, height: size }}
    />
  );
}
