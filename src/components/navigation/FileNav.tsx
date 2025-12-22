// src/components/navigation/FileNav.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NetworkStorageProvider, type UriNode } from '@/lib/storage';

export default function FileNav() {
  const [tree, setTree] = useState<UriNode | null>(null);

  useEffect(() => {
    const provider = new NetworkStorageProvider();
    provider
      .listFiles()
      .then(setTree)
      .catch(err => console.error(err));
  }, []);

  function renderNode(node: UriNode) {
    if (!node.children) {
      const href = `/studio?file=${encodeURIComponent(node.uri)}`;
      return (
        <li key={node.uri} className="ml-4 list-disc">
          <Link href={href} className="text-blue-600 hover:underline">
            {node.uri.split('/').pop()}
          </Link>
        </li>
      );
    }

    return (
      <li key={node.uri} className="ml-2">
        <details open>
          <summary className="cursor-pointer select-none">{node.uri.split('/').pop() ?? 'content'}</summary>
          <ul className="ml-4">
            {node.children?.map(child => renderNode(child))}
          </ul>
        </details>
      </li>
    );
  }

  if (!tree) return <div>Loading...</div>;
  return <ul>{tree.children?.map(child => renderNode(child))}</ul>;
}
