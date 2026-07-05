'use client';
// packages/shared/components/blocks/authoring/DocsBrowser/grammarDocContent.tsx
//
// Presentational view of one content format's documentation (PEG grammar,
// YAML schema) — the grammar-flavored counterpart to BlockDocContent.
// Header (name, format badge, extension), tab strip (Overview / Grammar /
// README / one per example), tab content. Data comes from useFormatDocs
// (get_formats MCP); this component just renders a FormatDocRecord.

import React from 'react';
import type { FormatDocRecord } from '@/lib/types';
import { asContentNamespace } from '@/lib/types/id-grammar';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import { OLXCodeBlock } from '@/components/common/OLXCodeBlock';
import { injectPreviewContent, hasContentPlaceholder } from '@/lib/template/previewTemplate';

function GrammarHeader({ format }: { format: FormatDocRecord }) {
  return (
    <div className="bg-background border-b px-6 py-4">
      <h2 className="text-xl font-bold text-foreground">{format.name}</h2>
      {format.description && <p className="text-secondary mt-1">{format.description}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-subtle text-accent">
          {format.type === 'peg' ? 'PEG Grammar' : 'YAML Schema'}
        </span>
        {format.extension && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground font-mono">
            .{format.extension}
          </span>
        )}
      </div>
    </div>
  );
}

function GrammarQuickReference({ format }: { format: FormatDocRecord }) {
  return (
    <section className="bg-background rounded-lg border p-6">
      <h3 className="font-medium text-foreground mb-3">Quick Reference</h3>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        {format.extension && (
          <>
            <dt className="text-dimmed">File extension</dt>
            <dd className="font-mono">.{format.extension}</dd>
          </>
        )}
        <dt className="text-dimmed">Grammar source</dt>
        <dd className="font-mono text-xs">{format.source ?? 'Unknown'}</dd>
        <dt className="text-dimmed">Used by</dt>
        <dd>{format.blocks.length ? format.blocks.join(', ') : '—'}</dd>
      </dl>
    </section>
  );
}

export function GrammarDocContent({ format, activeTab, onTabChange }: {
  format: FormatDocRecord;
  /** Controlled tab id ('overview' | 'grammar' | 'readme' | `example:${filename}`) —
   *  same controlled-tab contract as BlockDocContent. */
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  const ns = asContentNamespace(`docs.format.${format.name}`);
  const examples = Object.entries(format.examples ?? {});

  // format.preview is a template with a {{CONTENT}} placeholder; the sample
  // content lives in the `.preview.{extension}` example file. Render only
  // when both halves are present and injection succeeds.
  const previewContent = examples.find(([f]) => f.includes('.preview.'))?.[1].content;
  let previewOlx: string | null = null;
  if (format.preview && hasContentPlaceholder(format.preview) && previewContent) {
    const injected = injectPreviewContent(format.preview, previewContent);
    if ('olx' in injected) previewOlx = injected.olx;
  }

  const tabs = [{ id: 'overview', label: 'Overview' }];
  if (format.spec) tabs.push({ id: 'grammar', label: 'Grammar' });
  if (format.readme) tabs.push({ id: 'readme', label: 'README' });
  for (const [filename] of examples) {
    tabs.push({ id: `example:${filename}`, label: filename });
  }
  const currentTab = tabs.some(t => t.id === activeTab) ? activeTab : tabs[0].id;

  return (
    <div className="flex flex-col flex-1">
      <GrammarHeader format={format} />
      <div className="bg-background border-b px-6">
        <nav className="flex gap-4 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab.id === currentTab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-dimmed hover:text-secondary hover:border-border'
              }`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {currentTab === 'overview' && (
        <div className="p-6 flex flex-col gap-4">
          <GrammarQuickReference format={format} />
          {previewOlx && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted border-b text-xs text-dimmed">Live Preview</div>
              <div className="p-4 bg-background">
                <OLXCodeBlock language="olx:render" ns={ns}>{previewOlx}</OLXCodeBlock>
              </div>
            </div>
          )}
        </div>
      )}

      {currentTab === 'grammar' && format.spec && (
        <div className="p-6">
          <div className="bg-background rounded-lg border overflow-hidden">
            <div className="px-4 py-3 bg-surface border-b flex justify-between items-center">
              <span className="font-medium text-foreground">Grammar source</span>
              <code className="text-xs text-dimmed">{format.source}</code>
            </div>
            <pre className="p-4 text-xs overflow-x-auto"><code>{format.spec}</code></pre>
          </div>
        </div>
      )}

      {currentTab === 'readme' && format.readme && (
        <div className="p-6">
          <div className="bg-background rounded-lg border overflow-hidden">
            <div className="px-4 py-3 bg-surface border-b flex justify-between items-center">
              <span className="font-medium text-foreground">README</span>
              <code className="text-xs text-dimmed">{format.readme.path}</code>
            </div>
            <div className="p-6 prose max-w-none">
              <RenderMarkdown ns={ns}>{format.readme.content}</RenderMarkdown>
            </div>
          </div>
        </div>
      )}

      {currentTab.startsWith('example:') && (() => {
        const filename = currentTab.slice('example:'.length);
        const example = examples.find(([f]) => f === filename);
        if (!example) return null;
        return (
          <div className="p-6">
            <div className="bg-background rounded-lg border overflow-hidden">
              <div className="px-4 py-3 bg-surface border-b">
                <span className="font-medium text-foreground">{filename}</span>
              </div>
              <pre className="p-4 text-xs overflow-x-auto"><code>{example[1].content}</code></pre>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
