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

/** Live-rendered OLX in the standard "Live Preview" frame. */
export function LivePreviewPanel({ olx, ns }: { olx: string; ns: ContentNamespace }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted border-b text-xs text-dimmed">Live Preview</div>
      <div className="p-4 bg-background">
        <OLXCodeBlock language="olx:render" ns={ns}>{olx}</OLXCodeBlock>
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
