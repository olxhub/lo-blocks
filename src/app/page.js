// src/app/page.js
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
  const [entries, setEntries] = useState([]);
  const endpointLinks = [
    {
      href: '/api/content/root',
      label: '/api/content/root',
      type: 'JSON',
      description: 'Launchable content entries (GET)',
    },
    {
      href: '/api/content/all',
      label: '/api/content/all',
      type: 'JSON',
      description: 'Complete content map (GET)',
    },
    {
      href: null,
      label: '/api/content/[id]',
      type: 'JSON',
      description: 'Content lookup for a specific ID (GET)',
    },
    {
      href: '/api/files',
      label: '/api/files',
      type: 'JSON',
      description: 'File tree for the content directory (GET)',
    },
    {
      href: '/api/file?path=PATH/TO/FILE',
      label: '/api/file?path=…',
      type: 'JSON',
      description: 'Read an allowed file via a path query (GET)',
    },
    {
      href: '/api/admin/shutdown',
      label: '/api/admin/shutdown',
      type: 'JSON',
      description: 'Development-only shutdown endpoint (GET)',
    },
  ];

  useEffect(() => {
    fetch('/api/content/root')
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
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Endpoints</h2>
        <p className="mb-3 text-gray-700">Direct links to read-only endpoints, including JSON responses where available:</p>
        <ul className="space-y-2 list-disc pl-6">
          {endpointLinks.map(endpoint => (
            <li key={endpoint.label} className="space-x-2">
              {endpoint.href ? (
                <Link
                  href={endpoint.href}
                  className="text-blue-600 hover:underline"
                  target="_blank"
                >
                  {endpoint.label}
                </Link>
              ) : (
                <code className="text-sm bg-gray-100 px-1 py-0.5 rounded">
                  {endpoint.label}
                </code>
              )}
              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                {endpoint.type}
              </span>
              <span className="text-gray-700">{endpoint.description}</span>
            </li>
          ))}
        </ul>
      </section>
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
