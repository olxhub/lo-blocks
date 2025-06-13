// src/app/preview/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { render, makeRootNode } from '@/lib/render';
import AppHeader from '@/components/common/AppHeader';

export default function PreviewPage() {
  const params = useParams();
  const id = params?.id as string;
  const searchParams = useSearchParams()
  const debug = searchParams.get('debug') === 'true';

  const [idMap, setIdMap] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/content/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.ok) {
          setError(data.error);
        } else {
          setIdMap(data.idMap);
          setParsed(data.parsed);
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
      <AppHeader />
      <div className="p-6 flex-1 overflow-auto">
        <h1 className="text-xl font-bold mb-4">Preview: {id}</h1>
        <div className="space-y-4">
          {render({ node: id, idMap, nodeInfo: makeRootNode(), debug })}
        </div>

        {debug && (
          <pre className="mt-4 bg-gray-100 p-4 text-xs rounded overflow-auto">
            {JSON.stringify({ idMap, parsed }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
