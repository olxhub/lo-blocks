'use client';
// packages/shared/components/catalog/ActivityRow.tsx
//
// One launchable. Calm at rest (title · summary); actions reveal on hover/focus.
// Edit → Studio, Preview → /preview, plus a forge link to the source file when
// the source has a web view. `prominent` styles a Course heading its scenario.

import type { Repository, Launchable } from '@/lib/types';
import { studioHref, previewHref } from './links';
import ForgeLinkIcon from './forgeLinkIcon';

export default function ActivityRow({ repo, launchable, showRepo = false, prominent = false }: {
  repo: Repository;
  launchable: Launchable;
  /** Show which repo this activity is from — used in cross-repo search results. */
  showRepo?: boolean;
  /** Heading styling — used for the Course that leads a scenario. */
  prominent?: boolean;
}) {
  return (
    <div className="group flex items-start gap-4 py-2.5 border-b border-border-subtle last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <a
            href={previewHref(launchable.id)}
            className={`${prominent ? 'font-semibold' : 'font-medium'} text-foreground hover:text-accent`}
          >
            {launchable.title}
          </a>
          {launchable.status === 'draft' && <span className="lo-chip text-warning">Draft</span>}
        </div>
        {launchable.description && <p className="text-sm text-secondary mt-0.5">{launchable.description}</p>}
        {showRepo && <p className="text-xs text-dimmed mt-0.5">in {repo.label}</p>}
      </div>

      <div className="flex flex-col items-end gap-0.5 text-sm shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
        <a className="text-secondary hover:text-foreground" href={studioHref(repo.origin, { file: launchable.path })}>
          {repo.writable ? 'Edit' : 'Open'}
        </a>
        <a className="text-dimmed hover:text-foreground" href={previewHref(launchable.id)}>Preview</a>
        {launchable.forgeLink && <ForgeLinkIcon link={launchable.forgeLink} />}
      </div>
    </div>
  );
}
