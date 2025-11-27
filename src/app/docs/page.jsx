// src/app/docs/page.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RenderOLX from '@/components/common/RenderOLX';

// =============================================================================
// Utilities
// =============================================================================

const CATEGORY_MAP = {
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

const CATEGORY_ORDER = [
  'Layout', 'Display', 'Input', 'Grading', 'Action',
  'Reference', 'Specialized', 'Utility', 'CAPA Problems', 'Test Blocks', 'Other'
];

function getCategory(source) {
  if (!source) return 'Other';
  const match = source.match(/src\/components\/blocks\/([^/]+)\//);
  return match ? (CATEGORY_MAP[match[1]] || match[1]) : 'Other';
}

function buildTabs(blockDetails) {
  const tabs = [{ id: 'overview', label: 'Overview' }];

  if (blockDetails?.readme?.content) {
    tabs.push({ id: 'readme', label: 'README' });
  }

  blockDetails?.examples?.forEach((example, index) => {
    tabs.push({
      id: `example-${index}`,
      label: example.filename.replace(/\.(olx|xml)$/, ''),
    });
  });

  return tabs;
}

function groupBlocksByCategory(blocks) {
  const grouped = {};
  blocks.forEach(block => {
    const category = getCategory(block.source);
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(block);
  });

  // Sort by defined order
  const sorted = {};
  CATEGORY_ORDER.forEach(cat => {
    if (grouped[cat]) sorted[cat] = grouped[cat];
  });
  Object.keys(grouped).forEach(cat => {
    if (!sorted[cat]) sorted[cat] = grouped[cat];
  });
  return sorted;
}

// =============================================================================
// Reusable Components
// =============================================================================

function BlockSidebar({
  categories,
  selectedBlock,
  onSelectBlock,
  searchQuery,
  onSearchChange,
  collapsedCategories,
  onToggleCategory,
}) {
  const [hoveredBlock, setHoveredBlock] = useState(null);

  return (
    <aside className="w-64 bg-white border-r flex flex-col overflow-hidden">
      <div className="p-3 border-b">
        <input
          type="text"
          placeholder="Search blocks..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {Object.entries(categories).map(([category, blocks]) => (
          <div key={category} className="mb-2">
            <button
              onClick={() => onToggleCategory(category)}
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
                      onClick={() => onSelectBlock(block.name)}
                      className={`w-full text-left px-2 py-1 text-sm rounded flex items-center gap-1.5 ${
                        selectedBlock === block.name
                          ? 'bg-blue-100 text-blue-800'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className="truncate">{block.name}</span>
                      {block.readme && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Has documentation" />
                      )}
                      {block.examples?.length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" title="Has examples" />
                      )}
                    </button>

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
  );
}

function BlockHeader({ block }) {
  return (
    <div className="bg-white border-b px-6 py-4">
      <h2 className="text-xl font-bold text-gray-900">{block.name}</h2>
      {block.description && (
        <p className="text-gray-600 mt-1">{block.description}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        {block.hasAction && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Action
          </span>
        )}
        {block.hasParser && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            Parser
          </span>
        )}
        {block.fields?.length > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Fields: {block.fields.join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}

function BlockTabs({ tabs, activeTab, onTabChange }) {
  return (
    <div className="bg-white border-b px-6">
      <nav className="flex gap-4 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
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
  );
}

// =============================================================================
// Tab Content Components
// =============================================================================

function QuickReference({ block }) {
  return (
    <section className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Quick Reference</h3>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <div>
          <dt className="text-gray-500">Block Name</dt>
          <dd className="font-mono text-lg">&lt;{block.name} /&gt;</dd>
        </div>
        <div>
          <dt className="text-gray-500">Source</dt>
          <dd className="font-mono text-xs text-gray-600 break-all">
            {block.source || 'Unknown'}
          </dd>
        </div>
        {block.namespace && (
          <div>
            <dt className="text-gray-500">Namespace</dt>
            <dd className="font-mono text-sm">{block.namespace}</dd>
          </div>
        )}
        {block.fields?.length > 0 && (
          <div>
            <dt className="text-gray-500">Fields</dt>
            <dd className="font-mono text-sm">{block.fields.join(', ')}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function ExamplePreview({ example, showMoreCount }) {
  return (
    <section className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Example</h3>

      <div className="mb-4 border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-gray-100 border-b text-xs text-gray-500">
          Live Preview
        </div>
        <div className="p-4 bg-white">
          <RenderOLX inline={example.content} />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-gray-100 border-b text-xs text-gray-500 flex justify-between items-center">
          <span>OLX Source</span>
          <span className="text-gray-400">{example.filename}</span>
        </div>
        <div className="p-4 bg-gray-50 overflow-x-auto max-h-64">
          <pre className="text-sm">
            <code>{example.content}</code>
          </pre>
        </div>
      </div>

      {showMoreCount > 0 && (
        <p className="mt-4 text-sm text-gray-500">
          {showMoreCount} more example{showMoreCount > 1 ? 's' : ''} available in the tabs above.
        </p>
      )}
    </section>
  );
}

function OverviewTab({ block, details }) {
  const firstExample = details?.examples?.[0];
  const moreExamplesCount = (details?.examples?.length || 0) - 1;

  return (
    <div className="space-y-6">
      <QuickReference block={block} />
      {firstExample && (
        <ExamplePreview example={firstExample} showMoreCount={moreExamplesCount} />
      )}
    </div>
  );
}

function ReadmeTab({ content }) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="prose max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function ExampleTab({ example }) {
  return (
    <div className="space-y-6">
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
}

function BlockContent({ block, details, activeTab, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (activeTab === 'overview') {
    return <OverviewTab block={block} details={details} />;
  }

  if (activeTab === 'readme' && details?.readme?.content) {
    return <ReadmeTab content={details.readme.content} />;
  }

  if (activeTab.startsWith('example-')) {
    const index = parseInt(activeTab.replace('example-', ''), 10);
    const example = details?.examples?.[index];
    if (example) {
      return <ExampleTab example={example} />;
    }
  }

  return null;
}

// =============================================================================
// Main Page Component
// =============================================================================

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

  // Fetch block list on mount
  useEffect(() => {
    fetch('/api/docs')
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setDocs(data.documentation);
          const hash = window.location.hash.slice(1);
          const blockFromHash = hash && data.documentation.blocks.find(b => b.name === hash);
          setSelectedBlock(blockFromHash?.name || data.documentation.blocks[0]?.name || null);
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
      .then(data => data.ok && setBlockDetails(data.block))
      .catch(err => console.error('Error loading block details:', err))
      .finally(() => setLoadingDetails(false));
  }, [selectedBlock]);

  const categorizedBlocks = useMemo(() => {
    return docs?.blocks ? groupBlocksByCategory(docs.blocks) : {};
  }, [docs]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categorizedBlocks;
    const query = searchQuery.toLowerCase();
    const filtered = {};
    Object.entries(categorizedBlocks).forEach(([category, blocks]) => {
      const matching = blocks.filter(b =>
        b.name.toLowerCase().includes(query) ||
        b.description?.toLowerCase().includes(query)
      );
      if (matching.length) filtered[category] = matching;
    });
    return filtered;
  }, [categorizedBlocks, searchQuery]);

  const currentBlockMeta = useMemo(() => {
    return docs?.blocks?.find(b => b.name === selectedBlock) || null;
  }, [docs, selectedBlock]);

  const tabs = useMemo(() => buildTabs(blockDetails), [blockDetails]);

  const handleSelectBlock = (name) => {
    setSelectedBlock(name);
    setActiveTab('overview');
  };

  const handleToggleCategory = (category) => {
    setCollapsedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

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
      <header className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Learning Observer Blocks</h1>
        <p className="text-sm text-gray-500">
          {docs.totalBlocks} blocks • Generated {new Date(docs.generated).toLocaleDateString()}
        </p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <BlockSidebar
          categories={filteredCategories}
          selectedBlock={selectedBlock}
          onSelectBlock={handleSelectBlock}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          collapsedCategories={collapsedCategories}
          onToggleCategory={handleToggleCategory}
        />

        <main className="flex-1 overflow-hidden flex flex-col">
          {selectedBlock && currentBlockMeta ? (
            <>
              <BlockHeader block={currentBlockMeta} />
              <BlockTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
              <div className="flex-1 overflow-y-auto p-6">
                <BlockContent
                  block={currentBlockMeta}
                  details={blockDetails}
                  activeTab={activeTab}
                  loading={loadingDetails}
                />
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
