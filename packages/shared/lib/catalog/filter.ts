// packages/shared/lib/catalog/filter.ts
//
// Client-side filtering / sorting / faceting for the author catalog. Pure
// functions over the get_repositories result, so the view stays declarative.
// (filter/sort moves server-side when get_repositories grows `filter` — see
// docs/mcp-authoring.md.)

import type { Repository, Launchable } from '@/lib/catalog/schema';

export type Scope = 'all' | 'mine' | 'community';
export type Sort = 'name' | 'activities';

export interface CatalogFilters {
  scope: Scope;
  types: string[];   // block types (tags) to require
  query: string;
  sort: Sort;
}

export const initialCatalogFilters: CatalogFilters = {
  scope: 'all',
  types: [],
  query: '',
  sort: 'name',
};

/** Writable repos are "yours"; read-only ones are "community". */
export function repoScope(repo: Repository): 'mine' | 'community' {
  return repo.writable ? 'mine' : 'community';
}

export interface ScopeCounts { all: number; mine: number; community: number }

export function scopeCounts(repos: Repository[]): ScopeCounts {
  const mine = repos.filter(r => r.writable).length;
  return { all: repos.length, mine, community: repos.length - mine };
}

/** Block-type → count across (usable) launchables, for the Type facet. */
export function typeCounts(repos: Repository[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const repo of repos) {
    for (const l of repo.launchables) counts[l.type] = (counts[l.type] ?? 0) + 1;
  }
  return counts;
}

/** Keep a repo if it (or some launchable) matches the query; when only some
 *  launchables match, narrow the card to those. */
function applyQuery(repo: Repository, q: string): Repository | null {
  const needle = q.toLowerCase();
  const repoHit = [repo.label, repo.description ?? '', repo.origin, repo.discipline ?? '']
    .some(s => s.toLowerCase().includes(needle));
  if (repoHit) return repo;
  const launchables = repo.launchables.filter(l =>
    l.title.toLowerCase().includes(needle) || (l.description ?? '').toLowerCase().includes(needle),
  );
  return launchables.length ? { ...repo, launchables } : null;
}

function sortRepos(repos: Repository[], sort: Sort): Repository[] {
  return [...repos].sort((a, b) =>
    sort === 'activities' ? b.launchableCount - a.launchableCount : a.label.localeCompare(b.label),
  );
}

export function filterRepos(repos: Repository[], f: CatalogFilters): Repository[] {
  let out = repos;
  if (f.scope !== 'all') out = out.filter(r => repoScope(r) === f.scope);
  if (f.types.length) out = out.filter(r => r.launchables.some(l => f.types.includes(l.type)));
  if (f.query.trim()) {
    const q = f.query.trim();
    out = out.map(r => applyQuery(r, q)).filter((r): r is Repository => r !== null);
  }
  return sortRepos(out, f.sort);
}

export interface SearchHit { repo: Repository; launchable: Launchable }
export interface SearchResult { repos: Repository[]; activities: SearchHit[] }

/** Search mode: match repos AND activities (respecting scope), returned
 *  separately so the view can show "repositories" and "activities" lists —
 *  the cleaner /ux/ behaviour. */
export function searchCatalog(repos: Repository[], f: CatalogFilters): SearchResult {
  const scoped = f.scope === 'all' ? repos : repos.filter(r => repoScope(r) === f.scope);
  const q = f.query.trim().toLowerCase();
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
