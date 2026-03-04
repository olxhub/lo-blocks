// src/components/blocks/layout/Navigator/_NavigatorReadingDetail.jsx
'use client';

import React from 'react';
import { useBlock } from '@/lib/render';

function ReadingContent({ props, blockId }) {
  const { block } = useBlock(props, blockId);
  return <>{block}</>;
}

export default function _NavigatorReadingDetail(props) {
  const { ref, name, title, subtitle } = props;

  if (!ref) {
    return (
      <div className="p-6 text-red-500">
        No block reference specified. Use ref attribute.
      </div>
    );
  }

  const displayTitle = title || name || 'Reading';

  return (
    <div className="reading-detail-pane">
      <div className="sticky top-0 bg-white border-b p-4 z-10">
        <h2 className="text-xl font-semibold text-gray-900">{displayTitle}</h2>
        {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
      </div>
      <div className="p-6 prose prose-sm max-w-none">
        <ReadingContent props={props} blockId={ref} />
      </div>
    </div>
  );
}
