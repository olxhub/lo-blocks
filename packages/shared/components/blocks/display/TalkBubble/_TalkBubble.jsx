// src/components/blocks/display/TalkBubble/_TalkBubble.jsx
'use client';

import React from 'react';
import { useKids } from '@/lib/render';
import Avatar from '@/components/common/Avatar';
import { useCast, castMemberToAvatarProps } from '@/lib/cast';

export default function _TalkBubble(props) {
  const { speaker, avatar, seed, face, avatarStyle, position = 'left' } = props;
  const { kids } = useKids(props);
  const cast = useCast(props);

  const isLeft = position === 'left';

  // Build avatar props: cast defaults ← per-bubble attribute overrides
  const castMember = speaker ? cast[speaker] : undefined;
  let avatarProps;

  if (castMember) {
    const base = castMemberToAvatarProps(speaker, castMember);
    avatarProps = {
      name: base.name,
      seed: seed ?? base.seed,
      style: avatarStyle ?? base.style,
      src: avatar ?? base.src,
      options: face
        ? { ...(base.options || {}), face }
        : base.options,
    };
  } else {
    avatarProps = {
      name: speaker,
      seed: seed ?? speaker,
      style: avatarStyle ?? 'illustrated',
      src: avatar,
      options: face ? { face } : undefined,
    };
  }

  return (
    <div className={`flex gap-3 mb-4 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className="flex-shrink-0 pt-1">
        <Avatar {...avatarProps} size={48} />
      </div>

      {/* Speech bubble */}
      <div className="flex-1 max-w-2xl">
        {speaker && (
          <div className={`text-sm font-semibold text-gray-700 mb-1 ${isLeft ? 'text-start' : 'text-end'}`}>
            {castMember?.name ?? speaker}
          </div>
        )}
        <div className={`px-4 py-3 rounded-lg ${isLeft ? 'bg-gray-100' : 'bg-blue-100'}`}>
          {kids}
        </div>
      </div>
    </div>
  );
}
