// packages/shared/components/blocks/scenario/TalkBubble/_TalkBubble.jsx
'use client';

import React from 'react';
import { useKids } from '@/lib/render';
import * as cast from '@/lib/avatar/cast';

export default function _TalkBubble(props) {
  const { side } = props;
  const { kids } = useKids(props);
  const { avatar, name } = cast.avatar(props, { size: 48 });

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
          <div className={`text-sm font-semibold text-secondary mb-1 ${isPrimary ? 'text-start' : 'text-end'}`}>
            {name}
          </div>
        )}
        <div className={`px-4 py-3 rounded-lg ${isPrimary ? 'bg-muted' : 'bg-accent-subtle'}`}>
          {kids}
        </div>
      </div>
    </div>
  );
}
