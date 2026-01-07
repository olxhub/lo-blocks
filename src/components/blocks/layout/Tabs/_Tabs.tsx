// src/components/blocks/layout/Tabs/_Tabs.jsx
'use client';

import React from 'react';
import { useReduxState } from '@/lib/state';
import { useKids } from '@/lib/render';
import { useOlxJsonMultiple } from '@/lib/blocks/useOlxJson';

export default function _Tabs(props) {
  const { fields, kids = [] } = props;
  const [activeTab, setActiveTab] = useReduxState(props, fields.activeTab, 0);

  // Extract kid IDs for batch lookup (for tab labels)
  const kidIds = kids.filter(k => k?.type === 'block' && k?.id).map(k => k.id);
  const { olxJsons: kidBlocks } = useOlxJsonMultiple(props, kidIds);

  // Create a map for easy lookup by ID
  const kidBlockMap = Object.fromEntries(kidIds.map((id, i) => [id, kidBlocks[i]]));

  // Render all tab content upfront (useKids must be called unconditionally)
  const { kids: renderedContent } = useKids(props);

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

          // Extract title from the child block's attributes (using pre-fetched blocks)
          let tabLabel = `Tab ${index + 1}`;
          if (kid.type === 'block' && kid.id) {
            const childBlock = kidBlockMap[kid.id];
            if (childBlock) {
              tabLabel = childBlock.attributes?.title || tabLabel;
            }
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

      {/* Tab Content - show only active tab */}
      <div className="p-4">
        {renderedContent.map((content, index) => (
          <div key={index} style={{ display: index === currentTab ? 'block' : 'none' }}>
            {content}
          </div>
        ))}
      </div>
    </div>
  );
}
