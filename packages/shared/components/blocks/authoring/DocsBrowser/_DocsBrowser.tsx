'use client';
// packages/shared/components/blocks/authoring/DocsBrowser/_DocsBrowser.tsx
//
// Category sidebar (search + collapsible categories + a Grammars section,
// à la the legacy Next.js docs page) plus a main pane rendering the selected
// entry's documentation — BlockDocContent for blocks (shared with the
// BlockDoc block, so the two never drift), GrammarDocContent for content
// formats.
//
// Navigation is client-side: the selection lives in the URL-synced
// docsSelected field (?docsbrowser=Markdown, pushState — the Course
// selectedChild mechanism), so sidebar clicks re-render the pane without a
// page reload. props.selected (from a /docs/:Name deep link) seeds the
// initial selection; the field takes over after the first click. Grammar
// selections are encoded as `format:name`.

import React from 'react';
import type { RuntimeProps } from '@/lib/types';
import { useDocs, useFormats } from '@/lib/docs/useDocs';
import { CATEGORY_ORDER } from '@/lib/docs/categoryUtils';
import { useFieldState } from '@/lib/state';
import Spinner from '@/components/common/Spinner';
import Notice from '@/components/common/Notice';
import ResizableSidebar from '@/components/common/ResizableSidebar';
import { BlockDocView } from '../BlockDoc/_BlockDoc';
import { blockDocFields } from '../BlockDoc/locals';
import { GrammarDocView } from './grammarDocContent';
import { docsBrowserFields } from './locals';

const GRAMMARS_CATEGORY = 'Grammars';
const FORMAT_PREFIX = 'format:';

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type SidebarEntry = { key: string; label: string };
type SidebarCategory = { name: string; entries: SidebarEntry[] };

function CategorySection({ category, expanded, onToggle, selected, onSelect }: {
  category: SidebarCategory;
  expanded: boolean;
  onToggle: () => void;
  selected: string | undefined;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="mb-2">
      <button
        className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-secondary hover:bg-muted rounded"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span>{category.name}</span>
        <span className="flex items-center gap-1">
          <span className="text-xs text-dimmed">{category.entries.length}</span>
          <ChevronIcon expanded={expanded} />
        </span>
      </button>
      {expanded && (
        <div className="ms-2 mt-1">
          {category.entries.map(entry => (
            <button
              key={entry.key}
              onClick={() => onSelect(entry.key)}
              className={`w-full text-start px-2 py-1 text-sm rounded flex items-center gap-1.5 ${
                entry.key === selected
                  ? 'bg-accent-subtle text-accent'
                  : 'text-secondary hover:bg-muted'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DocsSidebar({ props, selected, onSelect }: {
  props: RuntimeProps;
  selected: string | undefined;
  onSelect: (key: string) => void;
}) {
  const { blocks, loading, error } = useDocs('*');
  const { formats, loading: formatsLoading } = useFormats('*');
  const [search, setSearch] = useFieldState(props, docsBrowserFields.docsSearch, '');
  const [categoryOverrides, setCategoryOverrides] = useFieldState(
    props, docsBrowserFields.docsCategoryOverrides, {} as Record<string, boolean>);

  const query = search.trim().toLowerCase();
  const matches = (name: string, description: string | null) =>
    !query || name.toLowerCase().includes(query) || (description ?? '').toLowerCase().includes(query);

  // Not groupBlocksByCategory (categoryUtils): that derives categories from
  // registry-shaped LoBlocks (block.category / source path); wire records
  // already carry resolved display labels in `categories`. Group by the
  // primary label, in the shared display order, then a Grammars section.
  const grouped: Record<string, SidebarEntry[]> = {};
  for (const b of blocks) {
    if (!matches(b.name, b.description)) continue;
    const category = b.categories[0] ?? 'Other';
    (grouped[category] ??= []).push({ key: b.name, label: b.name });
  }
  const categories: SidebarCategory[] = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)).sort(),
  ].map(name => ({ name, entries: grouped[name] }));

  const grammarEntries: SidebarEntry[] = formats
    .filter(f => matches(f.name, f.description))
    .map(f => ({ key: `${FORMAT_PREFIX}${f.name}`, label: f.name }));
  if (grammarEntries.length) {
    categories.push({ name: GRAMMARS_CATEGORY, entries: grammarEntries });
  }

  // Categories default closed; the selected entry's category defaults open;
  // an explicit user toggle (override map) wins over both. A search query
  // opens everything — collapsed matches would be invisible.
  const selectedCategory = selected?.startsWith(FORMAT_PREFIX)
    ? GRAMMARS_CATEGORY
    : blocks.find(b => b.name === selected)?.categories[0];
  const isExpanded = (name: string) =>
    !!query || (categoryOverrides[name] ?? name === selectedCategory);

  return (
    <>
      <div className="p-3 border-b border-border">
        <input
          type="search"
          className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="Search blocks & grammars…"
          aria-label="Search blocks and grammars"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {error && <p className="text-error text-sm p-2">Failed to load blocks: {error}</p>}
        {(loading || formatsLoading) && <Spinner>Loading blocks…</Spinner>}
        {!loading && !error && categories.map(category => (
          <CategorySection
            key={category.name}
            category={category}
            expanded={isExpanded(category.name)}
            onToggle={() => setCategoryOverrides({
              ...categoryOverrides,
              [category.name]: !isExpanded(category.name),
            })}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
      </nav>
    </>
  );
}

function WelcomePane() {
  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-foreground">Block documentation</h2>
      <p className="text-secondary mt-1">Pick a block or grammar from the sidebar to see its documentation.</p>
      <p className="text-dimmed text-sm mt-4">Search by name or description, or browse by category.</p>
    </div>
  );
}

export default function _DocsBrowser(props: RuntimeProps) {
  const initialSelected = typeof props.selected === 'string' ? props.selected : '';
  const [selected, setSelected] = useFieldState(
    props, docsBrowserFields.docsSelected, initialSelected);
  const [collapsed, setCollapsed] = useFieldState(props, docsBrowserFields.docsSidebarCollapsed, false);
  const [, setActiveTab] = useFieldState(props, blockDocFields.docTab, 'overview');

  // Selecting a new entry resets the tab — a leftover 'readme' tab from the
  // previous block would otherwise carry over (or silently fall back when
  // the new entry has no README).
  const select = (key: string) => {
    setSelected(key);
    setActiveTab('overview');
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <ResizableSidebar
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        defaultWidth={256}
        minWidth={180}
        maxWidth={400}
        chrome
        label="Block documentation"
      >
        <DocsSidebar props={props} selected={selected || undefined} onSelect={select} />
      </ResizableSidebar>

      <main className="flex-1 overflow-auto flex flex-col">
        {selected
          ? (selected.startsWith(FORMAT_PREFIX)
              ? <GrammarDocView props={props} name={selected.slice(FORMAT_PREFIX.length)} />
              : <BlockDocView props={props} name={selected} />)
          : <WelcomePane />}
        <div className="mt-auto px-6 py-4 border-t border-border text-[10px] text-dimmed leading-tight">
          <Notice />
        </div>
      </main>
    </div>
  );
}
