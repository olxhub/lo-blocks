// src/components/blocks/display/TalkBubble/_TalkBubble.jsx
'use client';

import React from 'react';
import { useKids } from '@/lib/render';

export default function _TalkBubble(props) {
  const { speaker, avatar, position = 'left' } = props.attributes || {};
  const { kids } = useKids(props);

  // Default avatar colors based on speaker name hash
  const getAvatarColor = (name) => {
    if (!name) return 'bg-gray-400';
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500'
    ];
    return colors[hash % colors.length];
  };

  const isLeft = position === 'left';
  const avatarColor = getAvatarColor(speaker);

  // Get initials from speaker name
  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const avatarContent = avatar ? (
    <img
      src={avatar}
      alt={speaker || 'Speaker'}
      className="w-12 h-12 rounded-full object-cover"
    />
  ) : (
    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${avatarColor}`}>
      {getInitials(speaker)}
    </div>
  );

  return (
    <div className={`flex gap-3 mb-4 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className="flex-shrink-0 pt-1">
        {avatarContent}
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
