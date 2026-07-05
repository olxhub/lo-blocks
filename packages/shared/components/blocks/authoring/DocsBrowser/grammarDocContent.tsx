'use client';
// packages/shared/components/blocks/authoring/DocsBrowser/grammarDocContent.tsx
//
// One content format's documentation (PEG grammar, YAML schema) — the
// grammar-flavored counterpart to _BlockDoc, built from the same shared
// panels (docPanels.tsx) so the two views stay visually identical.
// Header (name, format badge, extension), tab strip (Overview / Grammar /
// README / one per example), tab content. Data via useFormatDocs
// (get_formats MCP).

import React from 'react';
import type { RuntimeProps, FormatDocRecord } from '@/lib/types';
import { asContentNamespace } from '@/lib/types/id-grammar';
import { useFormats } from '@/lib/docs/useDocs';
import { useFieldState } from '@/lib/state';
import Spinner from '@/components/common/Spinner';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import { injectPreviewContent, hasContentPlaceholder } from '@/lib/template/previewTemplate';
import { DocHeader, DocTabs, LivePreviewPanel, FileCard } from '../BlockDoc/docPanels';
import { blockDocFields } from '../BlockDoc/locals';

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

  // format.preview is a template with a {{CONTENT}} placeholder; sample
  // content gets injected per view — the `.preview.{extension}` example on
  // the Overview tab, each example file on its own tab.
  const inject = (content: string): string | null => {
    if (!format.preview || !hasContentPlaceholder(format.preview)) return null;
    const injected = injectPreviewContent(format.preview, content);
    return 'olx' in injected ? injected.olx : null;
  };
  const previewContent = examples.find(([f]) => f.includes('.preview.'))?.[1].content;
  const previewOlx = previewContent ? inject(previewContent) : null;

  const tabs = [{ id: 'overview', label: 'Overview' }];
  if (format.spec) tabs.push({ id: 'grammar', label: 'Grammar' });
  if (format.readme) tabs.push({ id: 'readme', label: 'README' });
  for (const [filename] of examples) {
    tabs.push({ id: `example:${filename}`, label: filename });
  }
  const currentTab = tabs.some(t => t.id === activeTab) ? activeTab : tabs[0].id;

  return (
    <div className="flex flex-col flex-1">
      <DocHeader
        title={format.name}
        description={format.description}
        chips={[
          { label: format.type === 'peg' ? 'PEG Grammar' : 'YAML Schema', accent: true },
          ...(format.extension ? [{ label: `.${format.extension}` }] : []),
        ]}
      />
      <DocTabs tabs={tabs} active={currentTab} onSelect={onTabChange} />

      {currentTab === 'overview' && (
        <div className="p-6 flex flex-col gap-4">
          <GrammarQuickReference format={format} />
          {previewOlx && <LivePreviewPanel olx={previewOlx} ns={ns} />}
        </div>
      )}

      {currentTab === 'grammar' && format.spec && (
        <div className="p-6">
          <FileCard title="Grammar source" path={format.source}>
            <pre className="p-4 text-xs overflow-x-auto"><code>{format.spec}</code></pre>
          </FileCard>
        </div>
      )}

      {currentTab === 'readme' && format.readme && (
        <div className="p-6">
          <FileCard title="README" path={format.readme.path}>
            <div className="p-6 prose max-w-none">
              <RenderMarkdown ns={ns}>{format.readme.content}</RenderMarkdown>
            </div>
          </FileCard>
        </div>
      )}

      {currentTab.startsWith('example:') && (() => {
        const filename = currentTab.slice('example:'.length);
        const example = examples.find(([f]) => f === filename);
        if (!example) return null;
        const exampleOlx = inject(example[1].content);
        return (
          <div className="p-6 flex flex-col gap-4">
            {exampleOlx && <LivePreviewPanel olx={exampleOlx} ns={ns} />}
            <FileCard title={filename}>
              <pre className="p-4 text-xs overflow-x-auto"><code>{example[1].content}</code></pre>
            </FileCard>
          </div>
        );
      })()}
    </div>
  );
}

/** Fetch one format's full documentation and render it — the grammar
 *  counterpart of BlockDocView, used by DocsBrowser's detail pane. */
export function GrammarDocView({ props, name }: { props: RuntimeProps; name: string }) {
  const { formats, loading, error } = useFormats([name], ['readme', 'spec', 'preview', 'examples']);
  const [activeTab, setActiveTab] = useFieldState(props, blockDocFields.docTab, 'overview');

  if (error) return <div className="text-error text-sm p-2">Failed to load grammar documentation: {error}</div>;
  if (loading) return <Spinner>Loading grammar documentation…</Spinner>;

  const format = formats.find(f => f.name === name);
  if (!format) {
    return <p className="text-dimmed py-2 p-8">No documentation found for grammar {name}.</p>;
  }

  return <GrammarDocContent format={format} activeTab={activeTab} onTabChange={setActiveTab} />;
}
