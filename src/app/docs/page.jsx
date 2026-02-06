// src/app/docs/page.jsx
//
// Block and Grammar documentation page.
//
// TODO: This file is ~1000 lines. Consider splitting into:
//   - DocsPageSidebar.jsx (~150 lines) - BlockSidebar component
//   - DocsBlockComponents.jsx (~200 lines) - QuickReference, ExamplePreview, OverviewTab, etc.
//   - DocsGrammarComponents.jsx (~200 lines) - GrammarQuickReference, GrammarExamplePreview, etc.
//   - This file (~400 lines) - main page, routing, state management
//
// NOTE: Currently grammars are shown inline with blocks in a "Grammars" category.
// As we add more resource types (templates, archives, etc.), consider migrating
// to a tabbed interface: "Blocks | Grammars | Templates | ..."
//
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import PreviewPane from '@/components/common/PreviewPane';
import CodeEditor from '@/components/common/CodeEditor';
import Spinner from '@/components/common/Spinner';
import StatePanel from '@/components/common/StatePanel';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import { useFieldState } from '@/lib/state';
import { editorFields } from '@/lib/state/editorFields';
import { useBaselineProps } from '@/components/common/RenderOLX';
import { baseAttributes, inputMixin, graderMixin } from '@/lib/blocks/attributeSchemas';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';

// Shared attribute sets for documentation display.
// Derives attribute names from the actual mixin definitions (DRY).
const SHARED_ATTRIBUTE_SETS = [
  { label: 'Input attributes', names: Object.keys(inputMixin.shape), blockProp: 'isInput' },
  { label: 'Grader attributes', names: Object.keys(graderMixin.shape), blockProp: 'isGrader' },
  { label: 'Base attributes', names: Object.keys(baseAttributes.shape), blockProp: null },
];

// Hook for docs example editing - uses Redux state with docs-specific provenance
function useDocsExampleState(blockName, exampleFilename, originalContent) {
  const provenance = `docs://${blockName}/${exampleFilename}`;
  const baselineProps = useBaselineProps();
  return useFieldState(
    baselineProps,
    editorFields.editedContent,
    originalContent,
    { id: provenance }
  );
}

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
  '_test': 'Test Blocks',
  'grammar': 'Grammars'
};

const CATEGORY_ORDER = [
  'Layout', 'Display', 'Input', 'Grading', 'Action',
  'Reference', 'Specialized', 'Utility', 'CAPA Problems', 'Test Blocks', 'Grammars', 'Other'
];

function getCategory(block) {
  // Explicit category takes precedence
  if (block.category) {
    return CATEGORY_MAP[block.category] || block.category;
  }
  // Fall back to directory-based categorization
  if (!block.source) return 'Other';
  const match = block.source.match(/src\/components\/blocks\/([^/]+)\//);
  return match ? (CATEGORY_MAP[match[1]] || match[1]) : 'Other';
}

function buildTabs(blockDetails, isGrammar = false) {
  const tabs = [{ id: 'overview', label: 'Overview' }];

  if (blockDetails?.readme?.content) {
    tabs.push({ id: 'readme', label: 'README' });
  }

  // For grammars, add grammar source tab
  if (isGrammar && blockDetails?.grammar) {
    tabs.push({ id: 'grammar-source', label: 'Grammar' });
  }

  blockDetails?.examples?.forEach((example, index) => {
    // For grammars, remove the extension from label
    const ext = isGrammar ? blockDetails.extension : null;
    const label = isGrammar
      ? example.filename.replace(new RegExp(`\\.${ext}$`), '')
      : example.filename.replace(/\.(olx|xml)$/, '');
    tabs.push({
      id: `example-${index}`,
      label,
    });
  });

  return tabs;
}

function groupBlocksByCategory(blocks) {
  const grouped = {};
  blocks.forEach(block => {
    const category = getCategory(block);
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
  showInternal,
  onToggleInternal,
}) {
  const [hoveredBlock, setHoveredBlock] = useState(null);

  return (
    <aside className="w-64 bg-white border-r flex flex-col overflow-hidden">
      <div className="p-3 border-b">
        <input
          type="text"
          placeholder="Search blocks & grammars..."
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
                {blocks.map(block => {
                  // Determine if block or its docs are uncommitted
                  const blockUncommitted = block.gitStatus && block.gitStatus !== 'committed';
                  const docsUncommitted = block.readmeGitStatus && block.readmeGitStatus !== 'committed';
                  const examplesUncommitted = block.examples?.some(e => e.gitStatus && e.gitStatus !== 'committed');
                  const anyUncommitted = blockUncommitted || docsUncommitted || examplesUncommitted;

                  // Git status indicator styling
                  const getGitStatusStyle = (status) => {
                    if (status === 'untracked') return 'border-2 border-dashed border-amber-400';
                    if (status === 'modified') return 'border-2 border-amber-400';
                    return '';
                  };

                  return (
                    <div
                      key={block.name}
                      className="relative"
                      onMouseEnter={() => setHoveredBlock(block)}
                      onMouseLeave={() => setHoveredBlock(null)}
                    >
                      <button
                        onClick={() => onSelectBlock(block.name, block._isGrammar)}
                        className={`w-full text-left px-2 py-1 text-sm rounded flex items-center gap-1.5 ${
                          selectedBlock === block.name
                            ? 'bg-blue-100 text-blue-800'
                            : 'text-gray-600 hover:bg-gray-100'
                        } ${anyUncommitted ? 'bg-amber-50' : ''}`}
                      >
                        <span className={`truncate ${blockUncommitted ? 'italic' : ''}`}>
                          {block.name}
                          {block._isGrammar && (
                            <span className="text-gray-400 text-xs ml-1">.{block.extension}</span>
                          )}
                        </span>
                        {/* For grammars, show preview indicator instead of readme */}
                        {block._isGrammar ? (
                          block.hasPreview && (
                            <span
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-500"
                              title="Has preview"
                            />
                          )
                        ) : (
                          block.readme && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                docsUncommitted ? 'bg-amber-400' : 'bg-blue-500'
                              }`}
                              title={docsUncommitted
                                ? `README (${block.readmeGitStatus})`
                                : 'README (committed)'
                              }
                            />
                          )
                        )}
                        {(block.examples?.length > 0 || block.exampleCount > 0) && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              examplesUncommitted ? 'bg-amber-400' : 'bg-purple-500'
                            }`}
                            title={examplesUncommitted
                              ? `Examples (some uncommitted)`
                              : 'Examples'
                            }
                          />
                        )}
                      </button>

                      {hoveredBlock === block && block.description && (
                        <div className="absolute left-full ml-2 top-0 z-50 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                          {block.description}
                          {anyUncommitted && (
                            <div className="mt-1 pt-1 border-t border-gray-700 text-amber-300">
                              {blockUncommitted && <div>Block: {block.gitStatus}</div>}
                              {docsUncommitted && <div>README: {block.readmeGitStatus}</div>}
                              {examplesUncommitted && <div>Examples: uncommitted</div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-2 border-t">
        <label className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500 cursor-pointer hover:text-gray-700">
          <input
            type="checkbox"
            checked={showInternal}
            onChange={(e) => onToggleInternal(e.target.checked)}
            className="w-3 h-3"
          />
          Show internal blocks
        </label>
      </div>
    </aside>
  );
}

function BlockHeader({ block, isGrammar = false }) {
  return (
    <div className="bg-white border-b px-6 py-4">
      <h2 className="text-xl font-bold text-gray-900">
        {block.name}
        {isGrammar && (
          <span className="text-gray-400 font-normal ml-2">.{block.extension}</span>
        )}
      </h2>
      {block.description && (
        <p className="text-gray-600 mt-1">{block.description}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        {isGrammar ? (
          // Grammar badges
          <>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
              PEG Grammar
            </span>
            {block.hasPreview && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Preview
              </span>
            )}
            {block.exampleCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                {block.exampleCount} example{block.exampleCount > 1 ? 's' : ''}
              </span>
            )}
          </>
        ) : (
          // Block badges
          <>
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
          </>
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
  const attributes = block.attributes || [];

  // Collect all shared attribute names
  const allSharedNames = SHARED_ATTRIBUTE_SETS.flatMap(set => set.names);

  // Block-specific attributes (not in any shared set)
  const customAttrs = attributes.filter(attr => !allSharedNames.includes(attr.name));

  // Filter shared sets: only show if block has matching prop (or no condition)
  const applicableSets = SHARED_ATTRIBUTE_SETS
    .filter(set => !set.blockProp || block[set.blockProp])
    .map(set => ({
      ...set,
      attrs: attributes.filter(attr => set.names.includes(attr.name))
    }))
    .filter(set => set.attrs.length > 0);

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

      {/* Attributes section */}
      {attributes.length > 0 && (
        <>
          <hr className="my-6 border-gray-200" />
          <h4 className="text-md font-semibold mb-3 text-gray-700">Attributes</h4>

          {customAttrs.length > 0 && (
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-gray-700">Name</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-700">Type</th>
                  <th className="text-left py-2 font-medium text-gray-700">Description</th>
                </tr>
              </thead>
              <tbody>
                {customAttrs.map(attr => (
                  <tr key={attr.name} className="border-b border-gray-100">
                    <td className="py-2 pr-4">
                      <code className="text-blue-600">{attr.name}</code>
                      {attr.required && <span className="text-red-500 ml-1">*</span>}
                    </td>
                    <td className="py-2 pr-4">
                      {attr.enumValues ? (
                        <span className="font-mono text-xs">
                          {attr.enumValues.map((v, i) => (
                            <span key={v}>
                              {i > 0 && ' | '}
                              <span className="text-green-700">&quot;{v}&quot;</span>
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-gray-600">{attr.type}</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-600">{attr.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Shared attribute sets (input, grader, base) */}
          <div className="space-y-1 text-sm text-gray-500">
            {applicableSets.map(set => (
              <div key={set.label}>
                <span className="font-medium">{set.label}: </span>
                {set.attrs.map((attr, i) => (
                  <span key={attr.name}>
                    {i > 0 && ', '}
                    <code
                      className="text-gray-600 cursor-help border-b border-dotted border-gray-400"
                      title={attr.description || attr.name}
                    >
                      {attr.name}
                    </code>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function GrammarQuickReference({ grammar }) {
  return (
    <section className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Quick Reference</h3>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <div>
          <dt className="text-gray-500">File Extension</dt>
          <dd className="font-mono text-lg">.{grammar.extension}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Grammar Source</dt>
          <dd className="font-mono text-xs text-gray-600 break-all">
            {grammar.source || 'Unknown'}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Grammar Name</dt>
          <dd className="font-mono text-sm">{grammar.name}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Directory</dt>
          <dd className="font-mono text-xs text-gray-600 break-all">
            {grammar.grammarDir}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function GrammarExamplePreview({ example, grammarName, extension }) {
  const [editedContent, setEditedContent] = useDocsExampleState(
    grammarName,
    example.filename,
    example.content
  );
  const isModified = editedContent !== example.content;

  const handleReset = useCallback(() => {
    setEditedContent(example.content);
  }, [example.content, setEditedContent]);

  return (
    <section className="bg-white rounded-lg border overflow-hidden">
      <h3 className="text-lg font-semibold p-4 pb-0">Example</h3>

      {/* Editor section */}
      <div className="p-4">
        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-100 border-b text-xs text-gray-500 flex justify-between items-center">
            <span className="flex items-center gap-2">
              Content Source
              {isModified && (
                <span className="text-amber-600 text-xs">(modified)</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {isModified && (
                <button
                  onClick={handleReset}
                  className="px-2 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                >
                  Reset
                </button>
              )}
              <span className="text-gray-400">{example.path}</span>
            </span>
          </div>
          <div className="bg-gray-50 overflow-hidden">
            <CodeEditor
              value={editedContent}
              onChange={setEditedContent}
              path={`example.${extension}`}
              maxHeight="200px"
              theme="light"
            />
          </div>
        </div>
      </div>

      {/* Preview pane */}
      <div className="border-t h-64">
        <PreviewPane
          path={`example.${extension}`}
          content={editedContent}
        />
      </div>
    </section>
  );
}

function GrammarSourceTab({ grammar }) {
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
        <span className="font-medium text-gray-700">Grammar Definition</span>
        <code className="text-xs text-gray-500">{grammar.source}</code>
      </div>
      <div className="overflow-hidden">
        <CodeEditor
          value={grammar.grammar || '// Grammar not available'}
          onChange={() => {}} // Read-only
          path={`${grammar.name}.pegjs`}
          maxHeight="600px"
          theme="light"
        />
      </div>
    </div>
  );
}

function GrammarExampleTab({ example, grammarName, extension }) {
  const [editedContent, setEditedContent] = useDocsExampleState(
    grammarName,
    example.filename,
    example.content
  );
  const isModified = editedContent !== example.content;

  const handleReset = useCallback(() => {
    setEditedContent(example.content);
  }, [example.content, setEditedContent]);

  return (
    <div className="space-y-4">
      {/* Editor section */}
      <section className="bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
          <span className="font-medium text-gray-700 flex items-center gap-2">
            Content
            {isModified && (
              <span className="text-amber-600 text-xs">(modified)</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {isModified && (
              <button
                onClick={handleReset}
                className="px-2 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 rounded"
              >
                Reset
              </button>
            )}
            <code className="text-xs text-gray-500">{example.path || example.filename}</code>
          </div>
        </div>
        <div className="overflow-hidden">
          <CodeEditor
            value={editedContent}
            onChange={setEditedContent}
            path={`example.${extension}`}
            maxHeight="300px"
            theme="light"
          />
        </div>
      </section>

      {/* Preview pane */}
      <section className="bg-white rounded-lg border overflow-hidden h-80">
        <PreviewPane
          path={`example.${extension}`}
          content={editedContent}
        />
      </section>
    </div>
  );
}

function ExamplePreview({ example, showMoreCount, blockName }) {
  const [editedContent, setEditedContent] = useDocsExampleState(
    blockName,
    example.filename,
    example.content
  );
  const [parsedIdMap, setParsedIdMap] = useState(null);
  const isModified = editedContent !== example.content;

  const handleReset = useCallback(() => {
    setEditedContent(example.content);
  }, [example.content, setEditedContent]);

  const handleParsed = useCallback(({ idMap }) => {
    setParsedIdMap(idMap);
  }, []);

  return (
    <section className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Example</h3>

      <div className="mb-4 border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-gray-100 border-b text-xs text-gray-500">
          Live Preview
        </div>
        <div className="p-4 bg-white">
          <PreviewPane path={example.path || 'example.olx'} content={editedContent} onParsed={handleParsed} />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-gray-100 border-b text-xs text-gray-500 flex justify-between items-center">
          <span className="flex items-center gap-2">
            OLX Source
            {isModified && (
              <span className="text-amber-600 text-xs">(modified)</span>
            )}
          </span>
          <span className="flex items-center gap-2">
            {isModified && (
              <button
                onClick={handleReset}
                className="px-2 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 rounded"
              >
                Reset
              </button>
            )}
            <span className="text-gray-400">{example.path}</span>
          </span>
        </div>
        <div className="bg-gray-50 overflow-hidden">
          <CodeEditor
            value={editedContent}
            onChange={setEditedContent}
            language="xml"
            maxHeight="256px"
            theme="light"
          />
        </div>
      </div>

      <StatePanel idMap={parsedIdMap} />

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
        <ExamplePreview example={firstExample} showMoreCount={moreExamplesCount} blockName={block.name} />
      )}
    </div>
  );
}

function ReadmeTab({ content, path }) {
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
        <span className="font-medium text-gray-700">README</span>
        <code className="text-xs text-gray-500">{path}</code>
      </div>
      <div className="p-6 prose max-w-none">
        <RenderMarkdown>{content}</RenderMarkdown>
      </div>
    </div>
  );
}

function ExampleTab({ example, blockName }) {
  const [editedContent, setEditedContent] = useDocsExampleState(
    blockName,
    example.filename,
    example.content
  );
  const [parsedIdMap, setParsedIdMap] = useState(null);
  const isModified = editedContent !== example.content;

  const handleReset = useCallback(() => {
    setEditedContent(example.content);
  }, [example.content, setEditedContent]);

  const handleParsed = useCallback(({ idMap }) => {
    setParsedIdMap(idMap);
  }, []);

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
          <span className="font-medium text-gray-700">Live Preview</span>
          <code className="text-xs text-gray-500">{example.path || example.filename}</code>
        </div>
        <div className="p-6">
          <PreviewPane path={example.path || example.filename} content={editedContent} onParsed={handleParsed} />
        </div>
        <StatePanel idMap={parsedIdMap} />
      </section>

      <section className="bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
          <span className="flex items-center gap-2">
            <span className="font-medium text-gray-700">Source Code</span>
            {isModified && (
              <span className="text-amber-600 text-xs">(modified)</span>
            )}
          </span>
          <span className="flex items-center gap-2">
            {isModified && (
              <button
                onClick={handleReset}
                className="px-2 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 rounded"
              >
                Reset
              </button>
            )}
            <code className="text-xs text-gray-500">{example.path || example.filename}</code>
          </span>
        </div>
        <div className="bg-gray-50 overflow-hidden">
          <CodeEditor
            value={editedContent}
            onChange={setEditedContent}
            language="xml"
            theme="light"
          />
        </div>
      </section>
    </div>
  );
}

function GrammarOverviewTab({ grammar, details }) {
  const firstExample = details?.examples?.[0];
  const moreExamplesCount = (details?.examples?.length || 0) - 1;

  return (
    <div className="space-y-6">
      <GrammarQuickReference grammar={grammar} />
      {firstExample && (
        <GrammarExamplePreview
          example={firstExample}
          grammarName={grammar.name}
          extension={details.extension}
        />
      )}
      {moreExamplesCount > 0 && (
        <p className="text-sm text-gray-500">
          {moreExamplesCount} more example{moreExamplesCount > 1 ? 's' : ''} available in the tabs above.
        </p>
      )}
    </div>
  );
}

function BlockContent({ block, details, activeTab, loading, isGrammar = false }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // Grammar-specific content
  if (isGrammar) {
    if (activeTab === 'overview') {
      return <GrammarOverviewTab grammar={block} details={details} />;
    }

    if (activeTab === 'readme' && details?.readme?.content) {
      return <ReadmeTab content={details.readme.content} path={details.readme.path} />;
    }

    if (activeTab === 'grammar-source' && details?.grammar) {
      return <GrammarSourceTab grammar={details} />;
    }

    if (activeTab.startsWith('example-')) {
      const index = parseInt(activeTab.replace('example-', ''), 10);
      const example = details?.examples?.[index];
      if (example) {
        return (
          <GrammarExampleTab
            example={example}
            grammarName={block.name}
            extension={details.extension}
          />
        );
      }
    }

    return null;
  }

  // Block content (original behavior)
  if (activeTab === 'overview') {
    return <OverviewTab block={block} details={details} />;
  }

  if (activeTab === 'readme' && details?.readme?.content) {
    return <ReadmeTab content={details.readme.content} path={details.readme.path} />;
  }

  if (activeTab.startsWith('example-')) {
    const index = parseInt(activeTab.replace('example-', ''), 10);
    const example = details?.examples?.[index];
    if (example) {
      return <ExampleTab example={example} blockName={block.name} />;
    }
  }

  return null;
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function DocsPage() {
  const localeAttrs = useLocaleAttributes();
  const [docs, setDocs] = useState(null);
  const [grammars, setGrammars] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [selectedIsGrammar, setSelectedIsGrammar] = useState(false);
  const [blockDetails, setBlockDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  // Start with all categories collapsed for cleaner initial view
  const [collapsedCategories, setCollapsedCategories] = useState(() => {
    const collapsed = {};
    CATEGORY_ORDER.forEach(cat => { collapsed[cat] = true; });
    return collapsed;
  });
  const [showInternal, setShowInternal] = useState(false);

  // Fetch block and grammar lists on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/docs').then(res => res.json()),
      fetch('/api/docs/grammars').then(res => res.json())
    ])
      .then(([blocksData, grammarsData]) => {
        if (blocksData.ok) {
          setDocs(blocksData.documentation);
        } else {
          setError(blocksData.error);
          return;
        }
        if (grammarsData.ok) {
          setGrammars(grammarsData.documentation);
        }
        // Handle URL hash for initial selection
        const hash = window.location.hash.slice(1);
        if (hash) {
          // Check if hash matches a grammar first
          const grammarMatch = grammarsData.ok &&
            grammarsData.documentation.grammars.find(g => g.name === hash || g.extension === hash);
          if (grammarMatch) {
            setSelectedBlock(grammarMatch.name);
            setSelectedIsGrammar(true);
            // Expand Grammars category
            setCollapsedCategories(prev => ({ ...prev, 'Grammars': false }));
            return;
          }
          // Check blocks
          const blockMatch = blocksData.ok &&
            blocksData.documentation.blocks.find(b => b.name === hash);
          if (blockMatch) {
            setSelectedBlock(blockMatch.name);
            setSelectedIsGrammar(false);
            // Expand the category containing this block
            const category = getCategory(blockMatch);
            setCollapsedCategories(prev => ({ ...prev, [category]: false }));
            return;
          }
        }
        // Default: select MarkupProblem (or first block as fallback)
        const blocks = blocksData.documentation?.blocks || [];
        const defaultBlock = blocks.find(b => b.name === 'MarkupProblem') || blocks[0];
        if (defaultBlock) {
          setSelectedBlock(defaultBlock.name);
          const category = getCategory(defaultBlock);
          setCollapsedCategories(prev => ({ ...prev, [category]: false }));
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

  // Fetch block or grammar details when selection changes
  useEffect(() => {
    if (!selectedBlock) return;
    setLoadingDetails(true);
    const endpoint = selectedIsGrammar
      ? `/api/docs/grammar/${selectedBlock}`
      : `/api/docs/${selectedBlock}`;
    fetch(endpoint)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setBlockDetails(selectedIsGrammar ? data.grammar : data.block);
        }
      })
      .catch(err => console.error('Error loading details:', err))
      .finally(() => setLoadingDetails(false));
  }, [selectedBlock, selectedIsGrammar]);

  const categorizedBlocks = useMemo(() => {
    const result = {};

    // Add blocks
    if (docs?.blocks) {
      const visibleBlocks = showInternal
        ? docs.blocks
        : docs.blocks.filter(b => !b.internal);
      Object.assign(result, groupBlocksByCategory(visibleBlocks));
    }

    // Add grammars as a separate category
    if (grammars?.grammars) {
      // Mark grammars with _isGrammar for sidebar to differentiate
      result['Grammars'] = grammars.grammars.map(g => ({
        ...g,
        _isGrammar: true,
        category: 'grammar'
      }));
    }

    return result;
  }, [docs, grammars, showInternal]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categorizedBlocks;
    const query = searchQuery.toLowerCase();
    const filtered = {};
    Object.entries(categorizedBlocks).forEach(([category, items]) => {
      const matching = items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        // For grammars, also search by extension
        (item._isGrammar && item.extension?.toLowerCase().includes(query))
      );
      if (matching.length) filtered[category] = matching;
    });
    return filtered;
  }, [categorizedBlocks, searchQuery]);

  const currentBlockMeta = useMemo(() => {
    if (selectedIsGrammar) {
      return grammars?.grammars?.find(g => g.name === selectedBlock) || null;
    }
    return docs?.blocks?.find(b => b.name === selectedBlock) || null;
  }, [docs, grammars, selectedBlock, selectedIsGrammar]);

  const tabs = useMemo(() => buildTabs(blockDetails, selectedIsGrammar), [blockDetails, selectedIsGrammar]);

  const handleSelectBlock = (name, isGrammar = false) => {
    setSelectedBlock(name);
    setSelectedIsGrammar(isGrammar);
    setActiveTab('overview');
  };

  const handleToggleCategory = (category) => {
    setCollapsedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner>Loading documentation...</Spinner>
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
    <div {...localeAttrs} className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-start">
        <div>
          <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-gray-700">
            <h1>Learning Observer Blocks</h1>
          </Link>
          <p className="text-sm text-gray-500">
            {docs.totalBlocks} blocks
            {grammars?.totalGrammars > 0 && ` • ${grammars.totalGrammars} grammars`}
            {' • '}Generated {new Date(docs.generated).toLocaleDateString()}
          </p>
        </div>
        <LanguageSwitcher />
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
          showInternal={showInternal}
          onToggleInternal={setShowInternal}
        />

        <main className="flex-1 overflow-hidden flex flex-col">
          {selectedBlock && currentBlockMeta ? (
            <>
              <BlockHeader block={currentBlockMeta} isGrammar={selectedIsGrammar} />
              <BlockTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
              <div className="flex-1 overflow-y-auto p-6">
                <BlockContent
                  block={currentBlockMeta}
                  details={blockDetails}
                  activeTab={activeTab}
                  loading={loadingDetails}
                  isGrammar={selectedIsGrammar}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a block or grammar from the sidebar to view details
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
