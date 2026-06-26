'use client';
// packages/shared/components/catalog/ActivityRow.tsx
//
// One launchable. Calm at rest (title · summary); actions reveal on hover/focus,
// stacked. Edit → Studio, Preview → /preview. Manage (runs/deployment) deferred.

import type { Repository, Launchable } from '@/lib/catalog/schema';
import { studioHref, previewHref } from '@/lib/catalog/links';

export default function ActivityRow({ repo, launchable, showRepo = false }: {
  repo: Repository;
  launchable: Launchable;
  /** Show which repo this activity is from — used in cross-repo search results. */
  showRepo?: boolean;
}) {
  return (
    <div className="group flex items-start gap-4 py-2.5 border-b border-border-subtle last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <a href={previewHref(launchable.id)} className="font-medium text-foreground hover:text-accent">
            {launchable.title}
          </a>
          {launchable.status === 'draft' && <span className="lo-chip text-warning">Draft</span>}
        </div>
        {launchable.description && <p className="text-sm text-secondary mt-0.5">{launchable.description}</p>}
        {showRepo && <p className="text-xs text-dimmed mt-0.5">in {repo.label}</p>}
      </div>

      <div className="flex flex-col items-end gap-1 text-sm shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <a className="text-secondary hover:text-foreground" href={studioHref(repo.origin, launchable.path)}>
          {repo.writable ? 'Edit' : 'Open'}
        </a>
        <a className="text-dimmed hover:text-foreground" href={previewHref(launchable.id)}>Preview</a>
        {/* TODO(later, not V1): Manage → runs/deployment (separate subsystem). */}
      </div>
    </div>
  );
}
