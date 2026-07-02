'use client';
// packages/shared/components/catalog/SearchResults.tsx
//
// Search mode: matching repositories and matching activities, side by side.
// Each activity shows which repo it's from (cross-repo provenance).

import type { RuntimeProps } from '@/lib/types';
import type { Repository } from '@/lib/types';
import { searchCatalog, type CatalogFilters } from '@/lib/catalog/filter';
import { scopedRepoProps } from './locals';
import RepoCard from './repoCard';
import ActivityRow from './activityRow';

function Head({ title, n }: { title: string; n: number }) {
  return (
    <div className="mb-3 border-b border-border pb-2">
      <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
        {title}<span className="text-dimmed text-sm font-normal">{n}</span>
      </h2>
    </div>
  );
}

export default function SearchResults({ repos, filters, parentProps }: { repos: Repository[]; filters: CatalogFilters; parentProps: RuntimeProps }) {
  const { repos: matchRepos, activities } = searchCatalog(repos, filters);
  const q = filters.query.trim();

  if (!matchRepos.length && !activities.length) {
    return <p className="text-dimmed py-8">Nothing matches “{q}”.</p>;
  }

  return (
    <div className="flex flex-col gap-10">
      <p className="text-sm text-secondary">
        {matchRepos.length} {matchRepos.length === 1 ? 'repository' : 'repositories'} and{' '}
        {activities.length} {activities.length === 1 ? 'activity' : 'activities'} match{' '}
        <span className="text-foreground font-medium">“{q}”</span>
      </p>

      {matchRepos.length > 0 && (
        <section>
          <Head title="Repositories" n={matchRepos.length} />
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {matchRepos.map(r => <RepoCard key={r.origin} {...scopedRepoProps(parentProps, r.origin)} repo={r} />)}
          </div>
        </section>
      )}

      {activities.length > 0 && (
        <section>
          <Head title="Activities" n={activities.length} />
          <div className="flex flex-col">
            {activities.map(({ repo, launchable }) => (
              <ActivityRow key={repo.origin + launchable.id} repo={repo} launchable={launchable} showRepo />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
