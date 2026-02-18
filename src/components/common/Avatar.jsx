// src/components/common/Avatar.jsx
//
// Shared avatar component used by ChatComponent and TalkBubble.
// Generates a consistent illustrated face from a name using DiceBear/Open Peeps.
// Falls back to initials circle if an explicit image URL is provided.
//
'use client';

import React, { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import * as openPeeps from '@dicebear/open-peeps';

/**
 * Render an avatar for a speaker.
 *
 * @param {string} name - Speaker name (used as seed for DiceBear generation)
 * @param {string} [src] - Optional explicit image URL (overrides generated avatar)
 * @param {number} [size=32] - Avatar size in pixels
 */
export default function Avatar({ name, src, size = 32 }) {
  const generatedSvg = useMemo(() => {
    if (src) return null;
    const avatar = createAvatar(openPeeps, {
      seed: name || 'unknown',
      size,
    });
    return avatar.toDataUri();
  }, [name, src, size]);

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

  return (
    <img
      src={generatedSvg}
      alt={name || 'Speaker'}
      className="rounded-full"
      style={{ width: size, height: size }}
    />
  );
}
