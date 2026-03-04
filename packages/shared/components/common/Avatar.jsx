// src/components/common/Avatar.jsx
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

const INITIALS_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500',
  'bg-red-500', 'bg-teal-500', 'bg-orange-500'
];

function getInitialsColor(name) {
  const hash = Array.from(name || '').reduce(
    (acc, ch) => ch.charCodeAt(0) + ((acc << 5) - acc),
    0
  );
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Render an avatar for a speaker.
 *
 * @param {string} name - Speaker name (used as default seed and for initials fallback)
 * @param {string} [src] - Explicit image URL (bypasses generation entirely)
 * @param {string} [seed] - Override seed for DiceBear (defaults to name)
 * @param {'illustrated'|'initials'} [style='illustrated'] - Avatar style
 * @param {object} [options] - DiceBear Open Peeps options pass-through
 *   (face, head, skinColor, clothingColor, accessories, facialHair, etc.)
 * @param {number} [size=32] - Avatar size in pixels
 */
export default function Avatar({ name, src, seed, style = 'illustrated', options, size = 32 }) {
  const generatedSvg = useMemo(() => {
    if (src || style === 'initials') return null;
    const dicebearOptions = {
      seed: seed || name || 'unknown',
      size,
      ...options,
    };
    // DiceBear expects array values for enumerated options like face, head, etc.
    // If the caller passes a single string, wrap it.
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
    return (
      <img
        src={src}
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
