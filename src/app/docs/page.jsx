// src/app/docs/page.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RenderOLX from '@/components/common/RenderOLX';

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

// Build dynamic tabs based on block's available content
function buildTabs(blockMeta, blockDetails) {
  const tabs = [
    { id: 'overview', label: 'Overview' }
  ];

  // Add README tab if documentation exists
  if (blockDetails?.readme?.content) {
    tabs.push({ id: 'readme', label: 'README' });
  }

  // Add one tab per example file
  if (blockDetails?.examples?.length > 0) {
    blockDetails.examples.forEach((example, index) => {
      tabs.push({
        id: `example-${index}`,
        label: example.filename.replace(/\.(olx|xml)$/, ''),
        exampleIndex: index
      });
    });
  }

  return tabs;
}

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
          // Check URL hash for initial block, otherwise select first
          const hash = window.location.hash.slice(1);
          const blockFromHash = hash && data.documentation.blocks.find(b => b.name === hash);
          if (blockFromHash) {
            setSelectedBlock(blockFromHash.name);
          } else if (data.documentation.blocks.length > 0) {
            setSelectedBlock(data.documentation.blocks[0].name);
          }
        } else {
          setError(data.error);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Update URL hash when selected block changes
  useEffect(() => {
    if (selectedBlock && typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${selectedBlock}`);
    }
  }, [selectedBlock]);

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

  // Build tabs dynamically based on block content
  const tabs = useMemo(() => {
    return buildTabs(currentBlockMeta, blockDetails);
  }, [currentBlockMeta, blockDetails]);

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
                <nav className="flex gap-4 overflow-x-auto">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {tab.label}
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
                        {/* Quick Reference + Source combined */}
                        <section className="bg-white rounded-lg border p-6">
                          <h3 className="text-lg font-semibold mb-4">Quick Reference</h3>
                          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                            <div>
                              <dt className="text-gray-500">Block Name</dt>
                              <dd className="font-mono text-lg">&lt;{selectedBlock} /&gt;</dd>
                            </div>
                            <div>
                              <dt className="text-gray-500">Source</dt>
                              <dd className="font-mono text-xs text-gray-600 break-all">
                                {currentBlockMeta.source || 'Unknown'}
                              </dd>
                            </div>
                            {currentBlockMeta.namespace && (
                              <div>
                                <dt className="text-gray-500">Namespace</dt>
                                <dd className="font-mono text-sm">{currentBlockMeta.namespace}</dd>
                              </div>
                            )}
                            {currentBlockMeta.fields?.length > 0 && (
                              <div>
                                <dt className="text-gray-500">Fields</dt>
                                <dd className="font-mono text-sm">{currentBlockMeta.fields.join(', ')}</dd>
                              </div>
                            )}
                          </dl>
                        </section>

                        {/* Main Example (if available) */}
                        {blockDetails?.examples?.[0] && (
                          <section className="bg-white rounded-lg border p-6">
                            <h3 className="text-lg font-semibold mb-4">Example</h3>

                            {/* Live Preview */}
                            <div className="mb-4 border rounded-lg overflow-hidden">
                              <div className="px-3 py-2 bg-gray-100 border-b text-xs text-gray-500">
                                Live Preview
                              </div>
                              <div className="p-4 bg-white">
                                <RenderOLX inline={blockDetails.examples[0].content} />
                              </div>
                            </div>

                            {/* Source Code */}
                            <div className="border rounded-lg overflow-hidden">
                              <div className="px-3 py-2 bg-gray-100 border-b text-xs text-gray-500 flex justify-between items-center">
                                <span>OLX Source</span>
                                <span className="text-gray-400">{blockDetails.examples[0].filename}</span>
                              </div>
                              <div className="p-4 bg-gray-50 overflow-x-auto max-h-64">
                                <pre className="text-sm">
                                  <code>{blockDetails.examples[0].content}</code>
                                </pre>
                              </div>
                            </div>

                            {blockDetails.examples.length > 1 && (
                              <p className="mt-4 text-sm text-gray-500">
                                {blockDetails.examples.length - 1} more example{blockDetails.examples.length > 2 ? 's' : ''} available in the tabs above.
                              </p>
                            )}
                          </section>
                        )}
                      </div>
                    )}

                    {/* README Tab */}
                    {activeTab === 'readme' && blockDetails?.readme?.content && (
                      <div className="bg-white rounded-lg border p-6">
                        <div className="prose max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {blockDetails.readme.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Individual Example Tabs */}
                    {activeTab.startsWith('example-') && (() => {
                      const exampleIndex = parseInt(activeTab.replace('example-', ''), 10);
                      const example = blockDetails?.examples?.[exampleIndex];
                      if (!example) return null;

                      return (
                        <div className="space-y-6">
                          {/* Live Preview */}
                          <section className="bg-white rounded-lg border overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
                              <span className="font-medium text-gray-700">Live Preview</span>
                              <a
                                href={`/view/${encodeURIComponent(example.path || example.filename)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Open in Viewer →
                              </a>
                            </div>
                            <div className="p-6">
                              <RenderOLX inline={example.content} />
                            </div>
                          </section>

                          {/* Source Code */}
                          <section className="bg-white rounded-lg border overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b">
                              <span className="font-medium text-gray-700">Source Code</span>
                              <span className="ml-2 text-sm text-gray-400">{example.filename}</span>
                            </div>
                            <div className="p-4 overflow-x-auto bg-gray-50">
                              <pre className="text-sm">
                                <code>{example.content}</code>
                              </pre>
                            </div>
                          </section>
                        </div>
                      );
                    })()}
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
