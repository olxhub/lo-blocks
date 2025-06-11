'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

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
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    fetch('/api/content/root')
      .then(res => res.json())
      .then(data => {
        const list = Object.keys(data.idMap).map(id => ({ id, ...data.idMap[id] }));
        setEntries(list);
      })
      .catch(err => console.error(err));
  }, []);

  if (!entries) return <div>Loading...</div>;

  return (
    <ul className="space-y-1">
      {entries.map(e => {
        const rp = relPath(e.provenance);
        const href = rp ? '/edit/' + rp.split('/').map(encodeURIComponent).join('/') : '#';
        return (
          <li key={e.id}>
            <Link href={href} className="text-blue-600 hover:underline">
              {e.attributes?.title || e.id}
            </Link>
            <span className="ml-1 text-gray-500 text-xs">({e.tag})</span>
          </li>
        );
      })}
    </ul>
  );
}
