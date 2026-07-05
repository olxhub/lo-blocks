'use client';
// packages/shared/components/blocks/authoring/BlockDoc/docPanels.tsx
//
// Shared presentational pieces for documentation views — used by both
// _BlockDoc (block docs) and DocsBrowser's grammarDocContent (format docs)
// so the two stay visually identical: header (title/description/chips),
// tab strip, live-preview panel, and the titled bordered card that wraps
// READMEs, sources, and example code.

import React from 'react';
import type { ContentNamespace } from '@/lib/types';
import { OLXCodeBlock } from '@/components/common/OLXCodeBlock';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { useContentLoader } from '@/lib/content/useContentLoader';
import {
  parseStateKey, parseDefinitionKey, splitNs, leafDefinitionKeyFromStateKey,
} from '@/lib/types/id-grammar';

export function DocHeader({ title, description, chips }: {
  title: string;
  description?: string | null;
  /** Chip labels; `accent: true` renders the highlighted variant (e.g. the
   *  "PEG Grammar" badge). */
  chips: { label: string; accent?: boolean }[];
}) {
  return (
    <div className="bg-background border-b px-6 py-4">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      {description && <p className="text-secondary mt-1">{description}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        {chips.map(chip => (
          <span
            key={chip.label}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              chip.accent ? 'bg-accent-subtle text-accent' : 'bg-muted text-foreground'
            }`}
          >
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DocTabs({ tabs, active, onSelect }: {
  tabs: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-background border-b px-6">
      <nav className="flex gap-4 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab.id === active
                ? 'border-accent text-accent'
                : 'border-transparent text-dimmed hover:text-secondary hover:border-border'
            }`}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Render an already-indexed block by DefinitionKey through the standard
 *  content pipeline (useContentLoader + RenderOLX, PreviewPage's core).
 *  The indexed copy was parsed in place with real provenance, so relative
 *  src=/cast= companion files resolved at parse time — the reason example
 *  previews render by id rather than re-parsing their text inline. */
function RenderIndexed({ rootId }: { rootId: string }) {
  const stateKey = parseStateKey(rootId);
  const { idMap, error, loading } = useContentLoader(leafDefinitionKeyFromStateKey(stateKey));

  if (error) return <div className="text-error text-sm">Failed to load example: {String(error)}</div>;
  if (loading) return <Spinner>Loading example…</Spinner>;

  return (
    <RenderOLX
      id={stateKey}
      ns={splitNs(parseDefinitionKey(rootId)).ns}
      baseIdMap={idMap ?? undefined}
      eventContext="docs"
    />
  );
}

/** Live-rendered OLX in the standard "Live Preview" frame.
 *
 *  Pass `rootId` (an indexed example's DefinitionKey) to render through the
 *  content pipeline — required for multifile examples. `olx` re-parses the
 *  string inline; use it only for synthetic content with no file identity
 *  (grammar preview-template injections, README code fences). */
export function LivePreviewPanel({ olx, rootId, ns }: {
  olx?: string;
  rootId?: string | null;
  ns: ContentNamespace;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted border-b text-xs text-dimmed">Live Preview</div>
      <div className="p-4 bg-background">
        {rootId
          ? <RenderIndexed rootId={rootId} />
          : olx !== undefined && <OLXCodeBlock language="olx:render" ns={ns}>{olx}</OLXCodeBlock>}
      </div>
    </div>
  );
}

/** Titled bordered card for file-like content (README, sources, example
 *  code). `path` renders dimmed on the right of the title bar. */
export function FileCard({ title, path, children }: {
  title: string;
  path?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background rounded-lg border overflow-hidden">
      <div className="px-4 py-3 bg-surface border-b flex justify-between items-center">
        <span className="font-medium text-foreground">{title}</span>
        {path && <code className="text-xs text-dimmed">{path}</code>}
      </div>
      {children}
    </div>
  );
}
