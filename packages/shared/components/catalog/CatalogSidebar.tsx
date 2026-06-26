'use client';
// packages/shared/components/catalog/CatalogSidebar.tsx
//
// Sidebar contents (rendered inside a ResizableSidebar). Scope facet —
// Everything / Yours / Community — the same "yours vs everyone's" split as the
// Studio source picker. (A Type/discipline facet returns once repos carry
// richer metadata; faceting on the raw block tag wasn't useful.)

import type { Repository } from '@/lib/catalog/schema';
import { scopeCounts, type CatalogFilters, type Scope } from '@/lib/catalog/filter';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'mine', label: 'Yours' },
  { key: 'community', label: 'Community' },
];

export default function CatalogSidebar({ repos, filters, onChange }: {
  repos: Repository[];
  filters: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
}) {
  const counts = scopeCounts(repos);

  return (
    <div className="p-4 flex flex-col gap-6 h-full">
      <section>
        <h2 className="lo-meta-label mb-2">Scope</h2>
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="Repository scope">
          {SCOPES.map(s => (
            <button
              key={s.key}
              role="radio"
              aria-checked={filters.scope === s.key}
              onClick={() => onChange({ ...filters, scope: s.key })}
              className={`flex items-center justify-between px-3 py-1.5 rounded text-sm transition-colors ${
                filters.scope === s.key ? 'bg-accent-subtle text-accent font-medium' : 'text-secondary hover:bg-muted'
              }`}
            >
              <span>{s.label}</span>
              <span className="text-dimmed">{counts[s.key]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-auto">
        <h2 className="lo-meta-label mb-2">Links</h2>
        <nav className="flex flex-col gap-1 text-sm">
          <a className="px-3 py-1.5 rounded text-secondary hover:bg-muted hover:text-foreground transition-colors" href="/docs">
            📖 Documentation
          </a>
          <a className="px-3 py-1.5 rounded text-secondary hover:bg-muted hover:text-foreground transition-colors"
             href="https://github.com/OlxHub/lo-blocks" target="_blank" rel="noopener noreferrer">
            🔗 GitHub
          </a>
        </nav>
      </section>
    </div>
  );
}
