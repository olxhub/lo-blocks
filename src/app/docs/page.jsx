// src/app/docs/page.jsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function DocsPage() {
  const [docs, setDocs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/docs')
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setDocs(data.documentation);
        } else {
          setError(data.error);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading documentation...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Learning Observer Blocks Documentation
          </h1>
          <p className="text-gray-600">
            Generated on {new Date(docs.generated).toLocaleString()} • {docs.totalBlocks} blocks documented
          </p>
        </header>

        <div className="grid gap-6">
          {docs.blocks.map(block => (
            <div key={block.name} className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-1">
                    {block.metadata?.name || block.name}
                  </h2>
                  {block.metadata?.description && (
                    <p className="text-gray-600 mb-3">{block.metadata.description}</p>
                  )}
                </div>
                <Link 
                  href={`/docs/${block.name}`}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  View Details →
                </Link>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {block.component && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✓ Component
                  </span>
                )}
                {block.documentation && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    ✓ Documentation
                  </span>
                )}
                {block.examples.length > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    ✓ Examples ({block.examples.length})
                  </span>
                )}
              </div>

              <div className="text-sm text-gray-500">
                <code className="bg-gray-100 px-2 py-1 rounded">
                  {block.path}
                </code>
              </div>
            </div>
          ))}
        </div>

        <footer className="mt-12 pt-8 border-t text-center text-gray-500">
          <p>
            This documentation is automatically generated from block definitions.
          </p>
          <p className="mt-1">
            To add documentation for a block, create <code>.md</code> and <code>.olx</code> files 
            in the block's directory.
          </p>
        </footer>
      </div>
    </div>
  );
}