// src/components/blocks/display/TalkBubble/_TalkBubble.jsx
'use client';

import React from 'react';
import { useKids } from '@/lib/render';
import Avatar from '@/components/common/Avatar';

export default function _TalkBubble(props) {
  const { speaker, avatar, seed, face, avatarStyle = 'illustrated', position = 'left' } = props.attributes || {};
  const { kids } = useKids(props);

  const isLeft = position === 'left';
  const avatarOptions = face ? { face } : undefined;

  return (
    <div className={`flex gap-3 mb-4 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className="flex-shrink-0 pt-1">
        <Avatar name={speaker} src={avatar} seed={seed} style={avatarStyle} options={avatarOptions} size={48} />
      </div>

      {/* Speech bubble */}
      <div className="flex-1 max-w-2xl">
        {speaker && (
          <div className={`text-sm font-semibold text-gray-700 mb-1 ${isLeft ? 'text-start' : 'text-end'}`}>
            {speaker}
          </div>
        )}
        <div className={`px-4 py-3 rounded-lg ${isLeft ? 'bg-gray-100' : 'bg-blue-100'}`}>
          {kids}
        </div>
      </div>
    </div>
  );
}
