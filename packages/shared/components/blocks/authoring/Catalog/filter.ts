// packages/shared/components/blocks/authoring/Catalog/filter.ts
//
// Client-side filtering / sorting / faceting for the author catalog. Pure
// functions over the get_repositories result, so the view stays declarative.
// (filter/sort moves server-side when get_repositories grows `filter` — see
// docs/mcp-authoring.md.)

import type { Repository, Launchable } from '@/lib/types';

export type Scope = 'all' | 'mine' | 'community';
export type Sort = 'name' | 'activities';

export interface CatalogFilters {
  scope: Scope;
  sort: Sort;
}

/** Writable repos are "yours"; read-only ones are "community". */
export function repoScope(repo: Repository): 'mine' | 'community' {
  return repo.writable ? 'mine' : 'community';
}

export interface ScopeCounts { all: number; mine: number; community: number }

export function scopeCounts(repos: Repository[]): ScopeCounts {
  const mine = repos.filter(r => r.writable).length;
  return { all: repos.length, mine, community: repos.length - mine };
}

function sortRepos(repos: Repository[], sort: Sort): Repository[] {
  return [...repos].sort((a, b) =>
    sort === 'activities' ? b.launchableCount - a.launchableCount : a.label.localeCompare(b.label),
  );
}

/** Scope + sort only — query text is handled by searchCatalog, which
 *  CatalogView renders instead of this list whenever there's a query. */
export function filterRepos(repos: Repository[], f: CatalogFilters): Repository[] {
  const out = f.scope === 'all' ? repos : repos.filter(r => repoScope(r) === f.scope);
  return sortRepos(out, f.sort);
}

export interface SearchHit { repo: Repository; launchable: Launchable }
export interface SearchResult { repos: Repository[]; activities: SearchHit[] }

/** Search mode: match repos AND activities (respecting scope), returned
 *  separately so the view can show "repositories" and "activities" lists —
 *  the cleaner /ux/ behaviour. */
export function searchCatalog(repos: Repository[], query: string, f: CatalogFilters): SearchResult {
  const scoped = f.scope === 'all' ? repos : repos.filter(r => repoScope(r) === f.scope);
  const q = query.trim().toLowerCase();
  if (!q) return { repos: [], activities: [] };

  const matchedRepos = scoped.filter(r =>
    [r.label, r.description ?? '', r.origin, r.discipline ?? ''].some(s => s.toLowerCase().includes(q)),
  );
  const activities: SearchHit[] = [];
  for (const r of scoped) {
    for (const l of r.launchables) {
      if (l.title.toLowerCase().includes(q) || (l.description ?? '').toLowerCase().includes(q)) {
        activities.push({ repo: r, launchable: l });
      }
    }
  }
  return { repos: sortRepos(matchedRepos, f.sort), activities };
}
