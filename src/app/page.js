// src/app/page.js
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    fetch('/special-route/api/content/root')
      .then(res => res.json())
      .then(data => {
        // Transform the object into an array of entries
        const allEntries = Object.keys(data.idMap).map(key => ({
          id: key,
          ...data.idMap[key]
        }));
        setEntries(allEntries);
      });
  }, []);


  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">📚 Learning Blocks</h1>
      <p className="mb-4">Explore available lessons and activities:</p>
      <ul className="space-y-2 list-disc pl-6">
        {entries.map(entry => (
          <li key={entry.id}>
            <Link href={`/preview/${entry.id}`} className="text-blue-600 hover:underline">
              {entry.attributes?.title || entry.id}
            </Link>
            <span className="ml-2 text-gray-500 text-sm">({entry.tag})</span>
            [
            <Link href={`/graph/${entry.id}`} className="ml-2 text-blue-600 hover:underline">
              graph
            </Link>
            <Link href={`/api/content/${entry.id}`} className="ml-2 text-green-700 hover:underline" target="_blank">
              api
            </Link>
            ]
          </li>
        ))}
      </ul>
    </main>
  );
}
