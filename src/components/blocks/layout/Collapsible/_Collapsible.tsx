// src/components/blocks/layout/Collapsible/_Collapsible.jsx
'use client';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/render';
import ExpandIcon from '@/components/common/ExpandIcon';

export default function _Collapsible(props) {
  const { fields, title, label } = props;
  const [expanded, setExpanded] = useFieldState(props, fields.expanded, false);

  // useKids must be called unconditionally, even if we don't display when collapsed
  const { kids: renderedKids } = useKids(props);

  const handleToggle = () => {
    setExpanded(!expanded);
  };

  const heading = title || label || 'Click to expand';

  return (
    <div className="collapsible-section border border-gray-300 rounded-md mb-2">
      <button
        onClick={handleToggle}
        className="collapsible-header w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        aria-expanded={expanded}
      >
        <span className="collapsible-title font-medium text-gray-900">{heading}</span>
        <ExpandIcon expanded={expanded} className="collapsible-arrow w-5 h-5 text-gray-500 transition-transform duration-200" />
      </button>

      {expanded && (
        <div className="collapsible-content p-4 border-t border-gray-200">
          {renderedKids}
        </div>
      )}
    </div>
  );
}
