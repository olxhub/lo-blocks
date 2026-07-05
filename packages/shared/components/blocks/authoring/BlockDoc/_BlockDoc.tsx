'use client';
// packages/shared/components/blocks/authoring/BlockDoc/_BlockDoc.tsx
//
// Renders one block's full documentation: header (name, category chips,
// description), a tab strip (Overview / README / one per example), and the
// tab content. Data via useBlockDocs (get_blocks MCP), with 'readme',
// 'examples', 'attributes' include levels — heavier than BlockIndex's
// descriptor-only listing.
//
// BlockDocContent is presentational (no data fetching) and exported so
// DocsBrowser's detail pane can reuse it directly — the two never show
// different content for the same block.

import React from 'react';
import type { RuntimeProps, BlockDocRecord } from '@/lib/types';
import { useBlockDocs } from '@/lib/docs/useBlockDocs';
import { asContentNamespace } from '@/lib/types/id-grammar';
import { useFieldState } from '@/lib/state';
import Spinner from '@/components/common/Spinner';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import { OLXCodeBlock } from '@/components/common/OLXCodeBlock';
import type { AttributeDoc } from '@/lib/docs/schemaUtils';
import { DocHeader, DocTabs, LivePreviewPanel, FileCard } from './docPanels';
import { blockDocFields } from './locals';

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type ExampleEntry = [filename: string, example: { content: string; rootId?: string | null }];

function buildTabs(block: BlockDocRecord, examples: ExampleEntry[]) {
  const tabs = [{ id: 'overview', label: 'Overview' }];
  if (block.readme) tabs.push({ id: 'readme', label: 'README' });
  for (const [filename] of examples) {
    tabs.push({ id: `example:${filename}`, label: filename.replace(/\.olx$/, '') });
  }
  return tabs;
}

// ---------------------------------------------------------------------------
// Quick reference (attribute table)
// ---------------------------------------------------------------------------

function QuickReference({ attributes }: { attributes: AttributeDoc[] }) {
  return (
    <section className="bg-background rounded-lg border p-6">
      <h3 className="font-medium text-foreground mb-3">Quick Reference</h3>
      <table className="w-full text-sm mb-4">
        <thead>
          <tr>
            <th className="text-start py-2 pe-4 font-medium text-secondary">Name</th>
            <th className="text-start py-2 pe-4 font-medium text-secondary">Type</th>
            <th className="text-start py-2 pe-4 font-medium text-secondary">Required</th>
            <th className="text-start py-2 font-medium text-secondary">Description</th>
          </tr>
        </thead>
        <tbody>
          {attributes.map(attr => (
            <tr key={attr.name} className="border-b border-border-subtle">
              <td className="py-2 pe-4">
                <code className="text-accent">{attr.name}</code>
                {attr.required && <span className="text-error ms-1">*</span>}
              </td>
              <td className="py-2 pe-4">
                {attr.enumValues?.length
                  ? attr.enumValues.map((v, i) => (
                      <React.Fragment key={v}>
                        {i > 0 && ' | '}
                        <span className="text-success">"{v}"</span>
                      </React.Fragment>
                    ))
                  : <span className="font-mono text-xs text-secondary">{attr.type}</span>}
              </td>
              <td className="py-2 pe-4 text-secondary">{attr.required ? 'Yes' : '—'}</td>
              <td className="py-2 text-secondary">
                {attr.description}
                {attr.default !== undefined && ` (default: ${JSON.stringify(attr.default)})`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Example preview
// ---------------------------------------------------------------------------

function ExamplePreview({ filename, content, rootId, ns, showMoreCount }: {
  filename: string; content: string; rootId?: string | null;
  ns: ReturnType<typeof asContentNamespace>; showMoreCount: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <LivePreviewPanel olx={content} rootId={rootId} ns={ns} />
      <FileCard title={filename}>
        <div className="p-4 bg-background">
          <OLXCodeBlock language="olx:code" ns={ns}>{content}</OLXCodeBlock>
        </div>
      </FileCard>
      {showMoreCount > 0 && (
        <p className="text-sm text-dimmed">
          {showMoreCount} more example{showMoreCount === 1 ? '' : 's'} available in the tabs above.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content
// ---------------------------------------------------------------------------

function OverviewTab({ block, attributes, examples, ns }: {
  block: BlockDocRecord; attributes: AttributeDoc[]; examples: ExampleEntry[]; ns: ReturnType<typeof asContentNamespace>;
}) {
  const [firstFilename, firstExample] = examples[0] ?? [];
  return (
    <div className="p-6 flex flex-col gap-4">
      {attributes.length > 0 && <QuickReference attributes={attributes} />}
      {firstExample && (
        <ExamplePreview
          filename={firstFilename}
          content={firstExample.content}
          rootId={firstExample.rootId}
          ns={ns}
          showMoreCount={examples.length - 1}
        />
      )}
    </div>
  );
}

function ReadmeTab({ block, ns }: { block: BlockDocRecord; ns: ReturnType<typeof asContentNamespace> }) {
  if (!block.readme) return null;
  return (
    <div className="p-6">
      <FileCard title="README" path={block.readme.path}>
        <div className="p-6 prose max-w-none">
          <RenderMarkdown ns={ns}>{block.readme.content}</RenderMarkdown>
        </div>
      </FileCard>
    </div>
  );
}

function ExampleTab({ filename, content, rootId, ns }: {
  filename: string; content: string; rootId?: string | null;
  ns: ReturnType<typeof asContentNamespace>;
}) {
  return (
    <div className="p-6">
      <ExamplePreview filename={filename} content={content} rootId={rootId} ns={ns} showMoreCount={0} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockDocContent — presentational, no data fetching
// ---------------------------------------------------------------------------

export function BlockDocContent({ block, activeTab, onTabChange }: {
  block: BlockDocRecord;
  /** Current tab id ('overview' | 'readme' | `example:${filename}`). Controlled
   *  by the caller (via useFieldState against its own RuntimeProps) so
   *  BlockDoc and DocsBrowser can each own their own tab-state field. */
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  const ns = asContentNamespace(`docs.${block.name}`);
  const attributes = (block.attributes as AttributeDoc[] | null | undefined) ?? [];
  const examples = Object.entries(block.examples ?? {})
    .filter(([filename]) => !filename.endsWith('.includes.olx')) as ExampleEntry[];

  const tabs = buildTabs(block, examples);
  const currentTab = tabs.some(t => t.id === activeTab) ? activeTab : tabs[0].id;

  return (
    <div className="flex flex-col flex-1">
      <DocHeader
        title={block.name}
        description={block.description}
        chips={block.categories.map(label => ({ label }))}
      />
      <DocTabs tabs={tabs} active={currentTab} onSelect={onTabChange} />
      {currentTab === 'overview' && (
        <OverviewTab block={block} attributes={attributes} examples={examples} ns={ns} />
      )}
      {currentTab === 'readme' && <ReadmeTab block={block} ns={ns} />}
      {currentTab.startsWith('example:') && (() => {
        const filename = currentTab.slice('example:'.length);
        const example = examples.find(([f]) => f === filename);
        return example
          ? <ExampleTab filename={filename} content={example[1].content} rootId={example[1].rootId} ns={ns} />
          : null;
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockDocView — data-fetching wrapper around BlockDocContent
// ---------------------------------------------------------------------------

/** Fetch one block's full documentation and render it. Shared between the
 *  BlockDoc block (below) and DocsBrowser's detail pane. Tab state lives in
 *  the caller's docTab field (keyed by `props`). */
export function BlockDocView({ props, name }: { props: RuntimeProps; name: string }) {
  const { blocks, loading, error } = useBlockDocs([name], ['readme', 'examples', 'attributes']);
  const [activeTab, setActiveTab] = useFieldState(props, blockDocFields.docTab, 'overview');

  if (error) return <div className="text-error text-sm p-2">Failed to load block documentation: {error}</div>;
  if (loading) return <Spinner>Loading block documentation…</Spinner>;

  // get_blocks matching is fuzzy/normalized (can match categories too),
  // so pick the exact record by name locally.
  const block = blocks.find(b => b.name === name);
  if (!block) {
    return <p className="text-dimmed py-2 p-8">No documentation found for {name}.</p>;
  }

  return <BlockDocContent block={block} activeTab={activeTab} onTabChange={setActiveTab} />;
}

// ---------------------------------------------------------------------------
// Default export — the BlockDoc block
// ---------------------------------------------------------------------------

export default function _BlockDoc(props: RuntimeProps) {
  const name = props.block;
  // Zod already rejects a missing block= at OLX parse time; this path only
  // exists for direct React usage. BlockDocView is a child component, so
  // its hooks are unconditional from React's perspective.
  if (typeof name !== 'string' || name.length === 0) {
    return <div className="text-error text-sm p-2">BlockDoc requires a block= attribute naming the block to document.</div>;
  }
  return <BlockDocView props={props} name={name} />;
}
