'use client';

import React from 'react';
import type { RuntimeProps } from '@/lib/types';
import { useKids, useKidsJson } from '@/lib/player/client/render';
import { useKidCursor } from '@/lib/player/client/useKidCursor';
import { useOlxJsonMultiple } from '@/lib/player/client/useOlxJson';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';

/** Give the active child its own component/hook lifetime. */
function TabPanel({ props, kid }: { props: RuntimeProps; kid: unknown }) {
  const { kids } = useKids({ ...props, kids: [kid] });
  return <>{kids}</>;
}

export default function Tabs(props: RuntimeProps) {
  const { t } = useBlockTranslation(props);
  const kids = useKidsJson(props);
  const cursor = useKidCursor(props, kids, props.fields.activeTab);

  // Headers need every visible child's metadata; panel rendering needs only
  // cursor.kid. Inactive child components are never mounted.
  const { olxJsons: blocks } = useOlxJsonMultiple(props, cursor.ids);

  if (cursor.count === 0) {
    return <div className="p-4 text-dimmed">{t('noTabsDefined')}</div>;
  }

  return (
    <div className="tabs-component border rounded-lg bg-background overflow-hidden">
      <div className="flex border-b bg-surface" role="tablist">
        {cursor.ids.map((id, index) => {
          const active = index === cursor.index;
          const title = blocks[index]?.attributes?.title;
          const label = typeof title === 'string' && title !== ''
            ? title
            : t('defaultTabLabel', { number: index + 1 });

          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => cursor.goto(index)}
              className={`
                px-4 py-3 font-medium text-sm transition-all
                ${active
                  ? 'bg-background text-accent border-b-2 border-accent'
                  : 'text-secondary hover:text-foreground hover:bg-muted'
                }
              `}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="p-4" role="tabpanel">
        {cursor.kid && (
          <TabPanel key={cursor.id} props={props} kid={cursor.kid} />
        )}
      </div>
    </div>
  );
}
