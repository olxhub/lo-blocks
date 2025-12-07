// src/app/preview/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppHeader from '@/components/common/AppHeader';
import RenderOLX from '@/components/common/RenderOLX';
import { useReduxState, settingsFields } from '@/lib/state';
import { ComponentError, IdMap } from '@/lib/types';

export default function PreviewPage() {
  const params = useParams();
  const id = params.id as string;
  const [debug] = useReduxState(
    {},
    settingsFields.fieldInfoByField.debug,
    false,
    { id: id, tag: 'preview' } // HACK: This works around not having proper props. Should be fixed. See below
  );

  const [idMap, setIdMap] = useState<IdMap | null>(null);
  const [error, setError] = useState<ComponentError>(null);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/content/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.ok) {
          setError(data.error);
        } else {
          setIdMap(data.idMap);
        }
      })
      .catch(err => setError(err.message));
  }, [id]);

  if (error) {
    return <pre className="text-red-600">Error: {error}</pre>;
  }

  if (!idMap) return <div>Loading...</div>;

  return (
    <div className="flex flex-col h-screen">
      <AppHeader home debug user />
      <div className="p-6 flex-1 overflow-auto">
        <h1 className="text-xl font-bold mb-4">Preview: {id}</h1>
        <div className="space-y-4">
          <RenderOLX
            id={id}
            baseIdMap={idMap}
            onError={(err) => setError(err.message)}
          />
        </div>

        {debug && (
          <pre className="mt-4 bg-gray-100 p-4 text-xs rounded overflow-auto">
            {JSON.stringify({ idMap }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// TODO for hack above
// We have a hack where useReduxState requires props. We should do several things:
// * Make a 'global' or 'common' props object to use outside of render. Use a sentinel tag and ID
//   - Consider a shared props constructor or factory, so things don't go out of sync?
//   - 2 might places might not be enough to merit that.
// * Remove need for tag and ID in contexts we don't need it (e.g. system-wide state)
//
// This hack is present in debug.js (twice), AppHeader, and here
