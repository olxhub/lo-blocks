// src/app/docs/page.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Extract category from source path like "src/components/blocks/display/Markdown/Markdown.js"
function getCategory(source) {
  if (!source) return 'Other';
  const match = source.match(/src\/components\/blocks\/([^/]+)\//);
  if (!match) return 'Other';
  const category = match[1];
  // Capitalize and format category name
  const formatted = {
    'display': 'Display',
    'input': 'Input',
    'grading': 'Grading',
    'layout': 'Layout',
    'action': 'Action',
    'reference': 'Reference',
    'specialized': 'Specialized',
    'utility': 'Utility',
    'CapaProblem': 'CAPA Problems',
    '_test': 'Test Blocks'
  };
  return formatted[category] || category;
}

// Category order for consistent display
const CATEGORY_ORDER = [
  'Layout', 'Display', 'Input', 'Grading', 'Action',
  'Reference', 'Specialized', 'Utility', 'CAPA Problems', 'Test Blocks', 'Other'
];

// Tabs for the content panel
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'readme', label: 'README' },
  { id: 'examples', label: 'Examples' },
  { id: 'source', label: 'Source' }
];

export default function DocsPage() {
  const [docs, setDocs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [blockDetails, setBlockDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [hoveredBlock, setHoveredBlock] = useState(null);

  // Fetch block list on mount
  useEffect(() => {
    fetch('/api/docs')
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setDocs(data.documentation);
          // Select first block by default
          if (data.documentation.blocks.length > 0) {
            setSelectedBlock(data.documentation.blocks[0].name);
          }
        } else {
          setError(data.error);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Fetch block details when selection changes
  useEffect(() => {
    if (!selectedBlock) return;

    setLoadingDetails(true);
    fetch(`/api/docs/${selectedBlock}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setBlockDetails(data.block);
        }
      })
      .catch(err => console.error('Error loading block details:', err))
      .finally(() => setLoadingDetails(false));
  }, [selectedBlock]);

  // Group blocks by category
  const categorizedBlocks = useMemo(() => {
    if (!docs?.blocks) return {};

    const grouped = {};
    docs.blocks.forEach(block => {
      const category = getCategory(block.source);
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(block);
    });

    // Sort categories by defined order
    const sorted = {};
    CATEGORY_ORDER.forEach(cat => {
      if (grouped[cat]) sorted[cat] = grouped[cat];
    });
    // Add any remaining categories
    Object.keys(grouped).forEach(cat => {
      if (!sorted[cat]) sorted[cat] = grouped[cat];
    });

    return sorted;
  }, [docs]);

  // Filter blocks by search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categorizedBlocks;

    const query = searchQuery.toLowerCase();
    const filtered = {};

    Object.entries(categorizedBlocks).forEach(([category, blocks]) => {
      const matchingBlocks = blocks.filter(block =>
        block.name.toLowerCase().includes(query) ||
        (block.description && block.description.toLowerCase().includes(query))
      );
      if (matchingBlocks.length > 0) {
        filtered[category] = matchingBlocks;
      }
    });

    return filtered;
  }, [categorizedBlocks, searchQuery]);

  // Toggle category collapse
  const toggleCategory = (category) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Get current block's metadata
  const currentBlockMeta = useMemo(() => {
    if (!docs?.blocks || !selectedBlock) return null;
    return docs.blocks.find(b => b.name === selectedBlock);
  }, [docs, selectedBlock]);

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Learning Observer Blocks
        </h1>
        <p className="text-sm text-gray-500">
          {docs.totalBlocks} blocks • Generated {new Date(docs.generated).toLocaleDateString()}
        </p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r flex flex-col overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b">
            <input
              type="text"
              placeholder="Search blocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category list */}
          <nav className="flex-1 overflow-y-auto p-2">
            {Object.entries(filteredCategories).map(([category, blocks]) => (
              <div key={category} className="mb-2">
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded"
                >
                  <span>{category}</span>
                  <span className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">{blocks.length}</span>
                    <svg
                      className={`w-4 h-4 transition-transform ${collapsedCategories[category] ? '' : 'rotate-90'}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                </button>

                {/* Block list */}
                {!collapsedCategories[category] && (
                  <div className="ml-2 mt-1">
                    {blocks.map(block => (
                      <div
                        key={block.name}
                        className="relative"
                        onMouseEnter={() => setHoveredBlock(block)}
                        onMouseLeave={() => setHoveredBlock(null)}
                      >
                        <button
                          onClick={() => {
                            setSelectedBlock(block.name);
                            setActiveTab('overview');
                          }}
                          className={`w-full text-left px-2 py-1 text-sm rounded flex items-center gap-1.5 ${
                            selectedBlock === block.name
                              ? 'bg-blue-100 text-blue-800'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <span className="truncate">{block.name}</span>
                          {/* Doc indicator */}
                          {block.readme && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Has documentation" />
                          )}
                          {block.examples.length > 0 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" title="Has examples" />
                          )}
                        </button>

                        {/* Hover tooltip */}
                        {hoveredBlock === block && block.description && (
                          <div className="absolute left-full ml-2 top-0 z-50 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            {block.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content panel */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {selectedBlock && currentBlockMeta ? (
            <>
              {/* Block header */}
              <div className="bg-white border-b px-6 py-4">
                <h2 className="text-xl font-bold text-gray-900">{selectedBlock}</h2>
                {currentBlockMeta.description && (
                  <p className="text-gray-600 mt-1">{currentBlockMeta.description}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {currentBlockMeta.hasAction && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Action
                    </span>
                  )}
                  {currentBlockMeta.hasParser && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      Parser
                    </span>
                  )}
                  {currentBlockMeta.fields?.length > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Fields: {currentBlockMeta.fields.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="bg-white border-b px-6">
                <nav className="flex gap-4">
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {tab.label}
                      {tab.id === 'examples' && currentBlockMeta.examples?.length > 0 && (
                        <span className="ml-1 text-xs text-gray-400">
                          ({currentBlockMeta.examples.length})
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                {loadingDetails ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-gray-500">Loading...</div>
                  </div>
                ) : (
                  <>
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                      <div className="space-y-6">
                        <section className="bg-white rounded-lg border p-6">
                          <h3 className="text-lg font-semibold mb-3">Quick Reference</h3>
                          <dl className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <dt className="text-gray-500">Block Name</dt>
                              <dd className="font-mono">&lt;{selectedBlock} /&gt;</dd>
                            </div>
                            <div>
                              <dt className="text-gray-500">Category</dt>
                              <dd>{getCategory(currentBlockMeta.source)}</dd>
                            </div>
                            <div>
                              <dt className="text-gray-500">Has Documentation</dt>
                              <dd>{currentBlockMeta.readme ? 'Yes' : 'No'}</dd>
                            </div>
                            <div>
                              <dt className="text-gray-500">Examples</dt>
                              <dd>{currentBlockMeta.examples?.length || 0} file(s)</dd>
                            </div>
                          </dl>
                        </section>

                        {blockDetails?.readme?.content && (
                          <section className="bg-white rounded-lg border p-6">
                            <h3 className="text-lg font-semibold mb-3">Summary</h3>
                            <div className="prose prose-sm max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {blockDetails.readme.content.split('\n').slice(0, 15).join('\n')}
                              </ReactMarkdown>
                            </div>
                            {blockDetails.readme.content.split('\n').length > 15 && (
                              <button
                                onClick={() => setActiveTab('readme')}
                                className="mt-4 text-blue-600 hover:text-blue-800 text-sm"
                              >
                                Read more →
                              </button>
                            )}
                          </section>
                        )}

                        {currentBlockMeta.examples?.length > 0 && (
                          <section className="bg-white rounded-lg border p-6">
                            <h3 className="text-lg font-semibold mb-3">Quick Example</h3>
                            <div className="bg-gray-50 rounded border p-4 overflow-x-auto">
                              <pre className="text-sm">
                                <code>{blockDetails?.examples?.[0]?.content?.slice(0, 500) || 'Loading...'}</code>
                              </pre>
                            </div>
                            {currentBlockMeta.examples.length > 1 && (
                              <button
                                onClick={() => setActiveTab('examples')}
                                className="mt-4 text-blue-600 hover:text-blue-800 text-sm"
                              >
                                View all {currentBlockMeta.examples.length} examples →
                              </button>
                            )}
                          </section>
                        )}
                      </div>
                    )}

                    {/* README Tab */}
                    {activeTab === 'readme' && (
                      <div className="bg-white rounded-lg border p-6">
                        {blockDetails?.readme?.content ? (
                          <div className="prose max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {blockDetails.readme.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="text-center py-12 text-gray-500">
                            <p className="mb-2">No documentation available for this block.</p>
                            <p className="text-sm">
                              Create <code className="bg-gray-100 px-1 rounded">{selectedBlock}.md</code> in the block's directory.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Examples Tab */}
                    {activeTab === 'examples' && (
                      <div className="space-y-6">
                        {blockDetails?.examples?.length > 0 ? (
                          blockDetails.examples.map((example, index) => (
                            <div key={index} className="bg-white rounded-lg border">
                              <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
                                <span className="font-medium text-sm text-gray-700">
                                  {example.filename}
                                </span>
                                <a
                                  href={`/view/${encodeURIComponent(example.path || example.filename)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Open in Viewer →
                                </a>
                              </div>
                              <div className="p-4 overflow-x-auto">
                                <pre className="text-sm">
                                  <code>{example.content}</code>
                                </pre>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="bg-white rounded-lg border p-6 text-center text-gray-500">
                            <p className="mb-2">No examples available for this block.</p>
                            <p className="text-sm">
                              Create <code className="bg-gray-100 px-1 rounded">{selectedBlock}.olx</code> in the block's directory.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Source Tab */}
                    {activeTab === 'source' && (
                      <div className="bg-white rounded-lg border p-6">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-medium text-gray-500 mb-1">Source File</h3>
                            <code className="text-sm bg-gray-100 px-2 py-1 rounded block">
                              {currentBlockMeta.source || 'Unknown'}
                            </code>
                          </div>
                          {currentBlockMeta.namespace && (
                            <div>
                              <h3 className="text-sm font-medium text-gray-500 mb-1">Namespace</h3>
                              <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                                {currentBlockMeta.namespace}
                              </code>
                            </div>
                          )}
                          {currentBlockMeta.exportName && (
                            <div>
                              <h3 className="text-sm font-medium text-gray-500 mb-1">Export Name</h3>
                              <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                                {currentBlockMeta.exportName}
                              </code>
                            </div>
                          )}
                          <div className="pt-4 border-t">
                            <p className="text-sm text-gray-500">
                              View the source code in your editor or IDE at the path shown above.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a block from the sidebar to view details
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
