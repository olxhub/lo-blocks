'use client';
// packages/shared/components/catalog/RepoCard.tsx
//
// A repository: identity + description + a few launchables inline (expand for
// the rest). Source-first — origin and write access are visible at a glance.

import { useState } from 'react';
import type { Repository } from '@/lib/catalog/schema';
import { studioHref } from '@/lib/catalog/links';
import ActivityRow from './ActivityRow';

const PREVIEW = 4;

export default function RepoCard({ repo }: { repo: Repository }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? repo.launchables : repo.launchables.slice(0, PREVIEW);
  const hidden = repo.launchables.length - PREVIEW;

  return (
    <article className="lo-panel flex flex-col gap-3 p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{repo.label}</h3>
          <p className="lo-mono text-xs text-dimmed truncate">{repo.origin}</p>
        </div>
        <span className={`lo-chip shrink-0 ${repo.writable ? 'text-accent' : 'text-dimmed'}`}>
          {repo.writable ? 'Writable' : 'Read-only'}
        </span>
      </div>

      {repo.description && <p className="text-sm text-secondary">{repo.description}</p>}

      <p className="lo-muted text-xs">
        {repo.launchableCount} activit{repo.launchableCount === 1 ? 'y' : 'ies'}
        {repo.draftCount > 0 && ` · +${repo.draftCount} draft${repo.draftCount === 1 ? '' : 's'}`}
        {repo.internalCount > 0 && ` · ${repo.internalCount} internal`}
        {repo.discipline && ` · ${repo.discipline}`}
      </p>

      <div className="flex flex-col">
        {shown.map(l => <ActivityRow key={l.id} repo={repo} launchable={l} />)}
        {repo.launchables.length === 0 && (
          <p className="text-sm text-dimmed py-2">No usable activities yet.</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        {hidden > 0 ? (
          <button className="text-sm text-accent hover:underline" onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Show fewer' : `Show all ${repo.launchables.length}`}
          </button>
        ) : <span />}
        {/* The create-file affordance, prominent per repo (it confused teams
            when buried). Opens Studio scoped to this repo. */}
        {repo.writable && (
          <a className="lo-btn lo-btn--subtle lo-btn--sm" href={studioHref(repo.origin)}>+ New file</a>
        )}
      </div>
    </article>
  );
}
