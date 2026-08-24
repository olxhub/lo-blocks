// packages/shared/components/blocks/layout/Tabs/_Tabs.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { useKids, useKidsJson } from '@/lib/player/client/render';
import { useOlxJsonMultiple } from '@/lib/player/client/useOlxJson';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';

export default function Tabs(props: RuntimeProps) {
  const { fields } = props;
  const { t } = useBlockTranslation(props);
  const [activeTab, setActiveTab] = useFieldState(props, fields.activeTab, 0);

  // A tab switch scrolls this Tabs back into view. Matters most when the
  // switch came from elsewhere on a long page (SetFieldAction shortcut
  // buttons, the confirm-box jump): without it the student lands mid-page
  // on the new tab. Skips first render (initial/restored state must not
  // yank scroll) and hidden duplicates (offsetParent null under
  // display:none — only the visible copy scrolls).
  const rootRef = React.useRef<HTMLDivElement>(null);
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const el = rootRef.current;
    if (el && el.offsetParent !== null) el.scrollIntoView({ block: 'start' });
  }, [activeTab]);

  // Filtered kids (when= applied) — used for headers and content indexing
  const filteredKids = useKidsJson(props);

  // Extract definition keys for batch lookup (for tab labels)
  const definitionKeys = filteredKids
    .filter(k => k?.type === 'block' && k?.definitionKey)
    .map(k => k.definitionKey);
  const { olxJsons: kidBlocks } = useOlxJsonMultiple(props, definitionKeys);

  // Create a map for easy lookup by ID
  const kidBlockMap = Object.fromEntries(definitionKeys.map((definitionKey, i) => [definitionKey, kidBlocks[i]]));

  // Render all tab content upfront (useKids must be called unconditionally)
  const { kids: renderedContent } = useKids(props);

  if (filteredKids.length === 0) {
    return <div className="p-4 text-dimmed">{t('noTabsDefined')}</div>;
  }

  // Ensure activeTab is within bounds
  const numTabs = filteredKids.length;
  const currentTab = activeTab >= 0 && activeTab < numTabs ? activeTab : 0;
  if (currentTab !== activeTab) {
    setActiveTab(currentTab);
  }

  return (
    <div ref={rootRef} className="tabs-component border rounded-lg bg-background overflow-hidden">
      {/* Tab Headers.
         print="no-chrome" keeps the strip on screen but drops it from print
         via the shared .print-hide rule in styles/print.css — the active
         panel then prints as a plain page. */}
      <div className={`tabs-header flex border-b bg-surface${props.print === 'no-chrome' ? ' print-hide' : ''}`}>
        {filteredKids.map((kid, index) => {
          const isActive = index === currentTab;

          // Extract title from the child block's attributes (using pre-fetched blocks)
          let tabLabel = t('defaultTabLabel', { number: index + 1 });
          if (kid.type === 'block' && kid.definitionKey) {
            const childBlock = kidBlockMap[kid.definitionKey];
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
                  ? 'bg-background text-accent border-b-2 border-accent'
                  : 'text-secondary hover:text-foreground hover:bg-muted'
                }
              `}
            >
              {tabLabel}
            </button>
          );
        })}
      </div>

      {/* Tab Content - show only active tab */}
      {/* TODO: display:none keeps all tabs mounted, so OnShow trigger="each_view"
         only fires once (on first mount), not on each tab switch. Either unmount
         inactive tabs (like Sequential does) or add a visibility callback so
         OnShow can detect tab switches. */}
      <div className="p-4">
        {renderedContent.map((content, index) => (
          <div key={index} className="tab-panel" style={{ display: index === currentTab ? 'block' : 'none' }}>
            {content}
          </div>
        ))}
      </div>
    </div>
  );
}
