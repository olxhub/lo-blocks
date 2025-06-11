'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
  const searchParams = useSearchParams();
  const router = useRouter();

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
        const nav = searchParams.get('nav');
        const query = nav ? `?nav=${encodeURIComponent(nav)}` : '';
        const href = rp ? '/edit/' + rp.split('/').map(encodeURIComponent).join('/') + query : '#';
        const handleClick = (ev: React.MouseEvent) => {
          if (!rp) return;
          ev.preventDefault();
          router.push(href, { shallow: true } as any);
        };
        return (
          <li key={e.id}>
            <a href={href} onClick={handleClick} className="text-blue-600 hover:underline">
              {e.attributes?.title || e.id}
            </a>
            <span className="ml-1 text-gray-500 text-xs">({e.tag})</span>
          </li>
        );
      })}
    </ul>
  );
}
