// src/components/navigation/ComponentNav.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { buildDag, DagInfo } from '@/lib/graph/buildDag';

interface Entry {
  id: string;
  tag: string;
  attributes?: Record<string, any>;
  provenance?: string[];
}

function relPath(prov?: string[]): string | null {
  if (!prov || prov.length === 0) return null;
  const idx = prov[0].indexOf('/content/');
  return idx >= 0 ? prov[0].slice(idx + '/content/'.length) : prov[0];
}

export default function ComponentNav() {
  const [idMap, setIdMap] = useState<Record<string, Entry> | null>(null);
  const [dag, setDag] = useState<DagInfo | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    fetch('/api/content/all')
      .then(res => res.json())
      .then(data => {
        setIdMap(data.idMap);
        setDag(buildDag(data.idMap));
      })
      .catch(err => console.error(err));
  }, []);

  if (!dag || !idMap) return <div>Loading...</div>;

  function renderNode(id: string, visited: Set<string> = new Set()): JSX.Element | null {
    if (visited.has(id)) return null;
    visited.add(id);
    const entry = idMap[id];
    if (!entry) return null;
    const rp = relPath(entry.provenance);
    const nav = searchParams.get('nav');
    const query = nav ? `?nav=${encodeURIComponent(nav)}` : '';
    const href = rp ? '/edit/' + rp.split('/').map(encodeURIComponent).join('/') + query : '#';
    const kids = dag.childMap[id] || [];
    return (
      <li key={id} className="ml-2 list-disc">
        <Link href={href} className="text-blue-600 hover:underline">
          {entry.attributes?.title || id}
        </Link>
        <span className="ml-1 text-gray-500 text-xs">({entry.tag})</span>
        {kids.length > 0 && (
          <ul className="ml-4">
            {kids.map(kid => renderNode(kid, new Set(visited)))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <ul className="space-y-1">
      {dag.roots.map(id => renderNode(id))}
    </ul>
  );
}
