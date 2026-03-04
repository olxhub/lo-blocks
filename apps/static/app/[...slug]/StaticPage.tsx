// apps/static/app/[[...slug]]/StaticPage.tsx
//
// Client component: renders OLX content for a given key.
// Gets the idMap from StaticContentProvider context (loaded once for the whole app).
//
'use client';

import RenderOLX from '@/components/common/RenderOLX';
import { useStaticContent } from '../../lib/StaticContentProvider';
import { toOlxKey } from '@/lib/blocks/idResolver';

export default function StaticPage({ olxKey, title }: { olxKey: string; title?: string }) {
  const { idMap } = useStaticContent();
  const key = toOlxKey(olxKey);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="p-6 flex-1 overflow-auto">
        <RenderOLX
          id={key}
          baseIdMap={idMap}
          eventContext="static"
        />
      </div>
    </div>
  );
}
