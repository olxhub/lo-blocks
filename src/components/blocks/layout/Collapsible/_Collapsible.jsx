// src/components/blocks/layout/Collapsible/_Collapsible.jsx
'use client';

import React from 'react';
import { useReduxState } from '@/lib/state';
import { renderCompiledKids } from '@/lib/render';

export default function _Collapsible(props) {
  const { fields, kids = [], title, label } = props;
  const [expanded, setExpanded] = useReduxState(props, fields.expanded, false);

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
        <svg
          className={`collapsible-arrow w-5 h-5 text-gray-500 transition-transform duration-200 ${
            expanded ? 'transform rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {expanded && (
        <div className="collapsible-content p-4 border-t border-gray-200">
          {renderCompiledKids({ ...props, kids })}
        </div>
      )}
    </div>
  );
}
