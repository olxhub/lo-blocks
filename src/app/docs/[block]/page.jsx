// src/app/docs/[block]/page.jsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { use } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function BlockDocsPage({ params }) {
  const { block } = use(params);
  const [blockData, setBlockData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/docs/${block}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setBlockData(data.block);
        } else {
          setError(data.error);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [block]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading documentation for {block}...</div>
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <nav className="mb-6">
          <Link href="/docs" className="text-blue-600 hover:text-blue-800">
            ← Back to All Blocks
          </Link>
        </nav>

        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {blockData.name}
          </h1>
          {blockData.description && (
            <p className="text-gray-600 mb-2">{blockData.description}</p>
          )}
          {blockData.source && (
            <p className="text-gray-500 text-sm">
              Source: <code className="bg-gray-100 px-2 py-1 rounded">{blockData.source}</code>
              {blockData.namespace && (
                <span className="ml-2 text-gray-400">({blockData.namespace})</span>
              )}
            </p>
          )}
          {blockData.fields?.length > 0 && (
            <p className="text-gray-500 text-sm mt-1">
              Fields: {blockData.fields.map(f => <code key={f} className="bg-gray-100 px-1 mx-0.5 rounded">{f}</code>)}
            </p>
          )}
        </header>

        <div className="space-y-8">
          {/* Documentation */}
          {blockData.readme ? (
            <section className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Documentation</h2>
              <div className="prose max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {blockData.readme.content}
                </ReactMarkdown>
              </div>
            </section>
          ) : (
            <section className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-yellow-800 mb-2">
                Documentation Needed
              </h2>
              <p className="text-yellow-700">
                This block doesn't have documentation yet. Create a <code>{blockData.name}.md</code> file
                in the block's directory to add documentation.
              </p>
            </section>
          )}

          {/* Examples */}
          {blockData.examples?.length > 0 ? (
            <section className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Examples</h2>
              <div className="space-y-6">
                {blockData.examples.map((example, index) => (
                  <div key={index}>
                    <h3 className="text-lg font-medium text-gray-800 mb-2">
                      {example.filename}
                    </h3>
                    <div className="bg-gray-50 rounded border p-4 overflow-x-auto">
                      <pre className="text-sm">
                        <code>{example.content}</code>
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-yellow-800 mb-2">
                Examples Needed
              </h2>
              <p className="text-yellow-700">
                This block doesn't have examples yet. Create <code>{blockData.name}.olx</code> files
                in the block's directory to add working examples.
              </p>
            </section>
          )}

          {/* Future: Live Preview Section */}
          <section className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-blue-800 mb-2">
              Live Preview (Coming Soon)
            </h2>
            <p className="text-blue-700">
              In future versions, this section will render live, interactive examples
              of the block using the provided <code>.olx</code> files.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}