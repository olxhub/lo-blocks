// src/components/blocks/display/TalkBubble/_TalkBubble.jsx
'use client';

import React from 'react';
import { useKids } from '@/lib/render';
import { useAvatar } from '@/components/common/useAvatar';

export default function _TalkBubble(props) {
  const { side = 'primary' } = props;
  const { kids } = useKids(props);
  const { avatar, name } = useAvatar(props, { size: 48 });

  const isPrimary = side === 'primary';

  return (
    <div className={`flex gap-3 mb-4 ${isPrimary ? 'flex-row' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className="flex-shrink-0 pt-1">
        {avatar}
      </div>

      {/* Speech bubble */}
      <div className="flex-1 max-w-2xl">
        {name && (
          <div className={`text-sm font-semibold text-gray-700 mb-1 ${isPrimary ? 'text-start' : 'text-end'}`}>
            {name}
          </div>
        )}
        <div className={`px-4 py-3 rounded-lg ${isPrimary ? 'bg-gray-100' : 'bg-blue-100'}`}>
          {kids}
        </div>
      </div>
    </div>
  );
}
