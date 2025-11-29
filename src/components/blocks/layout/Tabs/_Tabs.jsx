// src/components/blocks/layout/Tabs/_Tabs.jsx
'use client';

import React from 'react';
import { useReduxState } from '@/lib/state';
import { renderCompiledKids } from '@/lib/render';

export default function _Tabs(props) {
  const { fields, kids = [], idMap } = props;
  const [activeTab, setActiveTab] = useReduxState(props, fields.activeTab, 0);

  if (kids.length === 0) {
    return <div className="p-4 text-gray-500">No tabs defined</div>;
  }

  // Ensure activeTab is within bounds
  const currentTab = activeTab >= 0 && activeTab < kids.length ? activeTab : 0;
  if (currentTab !== activeTab) {
    setActiveTab(currentTab);
  }

  return (
    <div className="tabs-component border rounded-lg bg-white overflow-hidden">
      {/* Tab Headers */}
      <div className="flex border-b bg-gray-50">
        {kids.map((kid, index) => {
          const isActive = index === currentTab;

          // Extract label from the child block's attributes
          let tabLabel = `Tab ${index + 1}`;
          if (kid.type === 'block' && kid.id && idMap?.[kid.id]) {
            const childBlock = idMap[kid.id];
            tabLabel = childBlock.attributes?.label || childBlock.attributes?.title || tabLabel;
          }

          return (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              className={`
                px-4 py-3 font-medium text-sm transition-all
                ${isActive
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }
              `}
            >
              {tabLabel}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {kids.map((kid, index) => {
          if (index !== currentTab) return null;

          return (
            <div key={index}>
              {renderCompiledKids({ ...props, kids: [kid] })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
