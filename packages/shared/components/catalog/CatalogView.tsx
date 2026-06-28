'use client';
// packages/shared/components/catalog/CatalogView.tsx
//
// The author front page: source-first catalog of repositories and their
// launchables, read from the get_repositories MCP tool (useCatalog). Styled with
// the platform's tokens/primitives — the look-and-feel follows the /ux/ mock,
// not its CSS. See docs/ux.md + docs/mcp-authoring.md.
//
// All state — catalog data and filter controls — lives in Redux.

import { useState, useMemo } from 'react';
import Spinner from '@/components/common/Spinner';
import Notice from '@/components/common/Notice';
import ResizableSidebar from '@/components/common/ResizableSidebar';
import { useFieldState } from '@/lib/state/redux';
import { system } from '@/lib/state/settings';
import { useCatalog } from '@/lib/catalog/useCatalog';
import {
  filterRepos, repoScope,
  type CatalogFilters, type Scope, type Sort,
} from '@/lib/catalog/filter';
import type { Repository } from '@/lib/catalog/schema';
import CatalogSidebar from './CatalogSidebar';
import RepoCard from './RepoCard';
import SearchResults from './SearchResults';

function Section({ title, caption, repos, wide = false }: {
  title: string; caption: string; repos: Repository[]; wide?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 border-b border-border pb-2">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          {title}<span className="text-dimmed text-sm font-normal">{repos.length}</span>
        </h2>
        <p className="text-sm text-secondary">{caption}</p>
      </div>
      <div className={`grid gap-4 ${wide ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {repos.map(r => <RepoCard key={r.origin} repo={r} />)}
      </div>
    </section>
  );
}

export default function CatalogView() {
  // Request launchable descriptions so rows have summaries.
  const { repositories, loading, error } = useCatalog(['launchables.description']);

  // Filter state — system-scope fields, read/written via useFieldState.
  const [scope, setScope] = useFieldState(null, system.catalogScope, 'all' as Scope, { tag: 'catalog' });
  const [query, setQuery] = useFieldState(null, system.catalogQuery, '', { tag: 'catalog' });
  const [sort, setSort] = useFieldState(null, system.catalogSort, 'name' as Sort, { tag: 'catalog' });
  const filters: CatalogFilters = useMemo(() => ({ scope, query, sort, types: [] }), [scope, query, sort]);

  // Sidebar collapse is a widget concern, not application state.
  const [collapsed, setCollapsed] = useState(false);

  if (error) return <div className="p-8 text-error">Failed to load catalog: {error}</div>;
  if (loading) return <div className="p-8"><Spinner>Loading catalog…</Spinner></div>;

  const shown = filterRepos(repositories, filters);
  const mine = shown.filter(r => repoScope(r) === 'mine');
  const community = shown.filter(r => repoScope(r) === 'community');

  return (
    <div className="flex h-screen bg-background text-foreground">
      <ResizableSidebar
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        defaultWidth={248}
        minWidth={200}
        maxWidth={360}
        chrome
        label="Catalog filters"
      >
        <CatalogSidebar repos={repositories} scope={scope} onScopeChange={setScope} />
      </ResizableSidebar>

      <main className="flex-1 overflow-auto flex flex-col">
        <div className="w-full max-w-5xl mx-auto px-8 flex flex-col flex-1">
          <header className="pt-8 pb-5 flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-2xl font-semibold">Repositories</h1>
            <div className="flex items-center gap-2">
              <input
                className="lo-control"
                type="search"
                placeholder="Search…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <label className="flex items-center gap-1.5 text-sm text-secondary whitespace-nowrap">
                Sort
                <select
                  className="lo-control"
                  value={sort}
                  onChange={e => setSort(e.target.value as Sort)}
                >
                  <option value="name">Name (A–Z)</option>
                  <option value="activities">Most activities</option>
                </select>
              </label>
              {/* New repository — coming with the add/create-repo flow. */}
              <button className="lo-btn lo-btn--primary lo-btn--sm" disabled title="Coming soon">+ New repository</button>
            </div>
          </header>

          <div className="flex flex-col gap-10 pb-12 flex-1">
            {query.trim() ? (
              <SearchResults repos={repositories} filters={filters} />
            ) : (
              <>
                {shown.length === 0 && <p className="text-dimmed py-8">Nothing matches those filters.</p>}
                {scope !== 'community' && mine.length > 0 && (
                  <Section title="Your repositories" caption="You have write access — edit and publish." repos={mine} wide />
                )}
                {scope !== 'mine' && community.length > 0 && (
                  <Section title="From the community" caption="Read-only — free to browse and reuse (AGPL-3.0)." repos={community} />
                )}
              </>
            )}
          </div>

          <footer className="border-t border-border mt-auto py-4 text-xs text-dimmed">
            <Notice />
          </footer>
        </div>
      </main>
    </div>
  );
}
