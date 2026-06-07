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

import { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import * as openPeeps from '@dicebear/open-peeps';
import { resolveContentPath } from '@/lib/content/contentPaths';
import { toDiceBear } from '@/lib/avatar/render';
import type { OpenPeeps } from '@/lib/avatar/types';

interface AvatarProps {
  name?: string;
  src?: string;
  emoji?: string;
  seed?: string;
  style?: 'illustrated' | 'initials' | 'emoji';
  options?: OpenPeeps;
  size?: number;
}

const INITIALS_COLORS = [
  'bg-accent', 'bg-success', 'bg-warning',
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500',
  'bg-error', 'bg-teal-500', 'bg-orange-500'
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

export default function Avatar({ name, src, emoji, seed, style = 'illustrated', options, size = 32 }: AvatarProps) {
  const generatedSvg = useMemo(() => {
    if (src || emoji || style === 'initials' || style === 'emoji') return undefined;
    const avatar = createAvatar(openPeeps, {
      seed: seed || name || 'unknown',
      size,
      ...toDiceBear(options ?? {}),
    });
    return avatar.toDataUri();
  }, [name, src, seed, style, options, size]);

  // Emoji avatar
  if (emoji || style === 'emoji') {
    const fontSize = Math.max(10, Math.round(size * 0.6));
    return (
      <div
        className="rounded-full bg-gray-100 flex items-center justify-center"
        style={{ width: size, height: size, fontSize }}
      >
        {emoji || '?'}
      </div>
    );
  }

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
        className={`rounded-full flex items-center justify-center text-inverse font-semibold ${bgColor}`}
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
