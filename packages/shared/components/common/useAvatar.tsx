// src/components/common/useAvatar.tsx
//
// Resolves a character from the cast and returns a rendered Avatar element
// plus display metadata. Consolidates the avatar-building logic used by
// TalkBubble, ChatComponent, and any future character-aware block.
//
// Usage (block component — reads who/face/etc. from props):
//   const { avatar, name } = useAvatar(props, { size: 48 });
//
// Usage (non-block component — pass character info explicitly):
//   const { avatar, name } = useAvatar({}, { who: speaker, cast, face });
//
import React from 'react';
import { z } from 'zod';
import Avatar from '@/components/common/Avatar';
import { useCast, castMemberToAvatarProps } from '@/lib/avatar/cast';
import { Face, AvatarStyle } from '@/lib/avatar/openpeeps';
import type { Cast } from '@/lib/avatar/openpeeps';

export interface UseAvatarOptions {
  /** Character ID override (defaults to props.who). */
  who?: string;
  /** Cast override (defaults to useCast(props)). */
  cast?: Cast;
  /** DiceBear face expression override (e.g. 'smile', 'serious'). */
  face?: z.infer<typeof Face>;
  /** Avatar seed override. */
  seed?: string;
  /** Image URL override. */
  src?: string;
  /** Avatar style override. */
  style?: z.infer<typeof AvatarStyle>;
  /** Avatar size in pixels (default 32). */
  size?: number;
}

export interface UseAvatarResult {
  /** Rendered <Avatar> element, ready to drop into JSX. */
  avatar: React.ReactNode;
  /** Character name (from cast member, or falls back to character ID). */
  name: string;
}

/**
 * Resolve a character from the cast and return a rendered avatar.
 *
 * Reads `who`, `face`, `seed`, `avatar`, `avatarStyle` from props
 * (the `character` mixin fields), with explicit overrides taking precedence.
 * Falls back gracefully when no cast or character is defined.
 */
export function useAvatar(props: any, options?: UseAvatarOptions): UseAvatarResult {
  const propsCast = useCast(props);
  const cast = options?.cast ?? propsCast;
  const who = options?.who ?? props.who;
  const face = options?.face ?? props.face;
  const seed = options?.seed ?? props.seed;
  const src = options?.src ?? props.avatar;
  const style = options?.style ?? props.avatarStyle;
  const size = options?.size ?? 32;

  const castMember = who ? cast[who] : undefined;

  let avatarProps;
  let name: string;

  if (castMember) {
    const base = castMemberToAvatarProps(who, castMember);
    avatarProps = {
      name: base.name,
      seed: seed ?? base.seed,
      style: style ?? base.style,
      src: src ?? base.src,
      options: face
        ? { ...(base.options || {}), face }
        : base.options,
    };
    name = base.name;
  } else {
    avatarProps = {
      name: who,
      seed: seed ?? who,
      style: style ?? 'illustrated',
      src,
      options: face ? { face } : undefined,
    };
    name = who ?? '';
  }

  return {
    avatar: <Avatar {...avatarProps} size={size} />,
    name,
  };
}
