'use client';
// packages/shared/components/catalog/RepoCard.tsx
//
// A repository: identity, then its activities organized into scenarios (a
// Course and its parts), then a collapsed drawer of building blocks. The title
// opens the repo in Studio (docs tab); a forge link points at the source. The
// raw origin is below-the-fold — a tooltip, not a banner.

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Repository } from '@/lib/catalog/schema';
import { groupByScenario } from '@/lib/catalog/group';
import { studioHref } from '@/lib/catalog/links';
import ScenarioGroup from './ScenarioGroup';
import ActivityRow from './ActivityRow';
import ForgeLinkIcon from './ForgeLinkIcon';

export default function RepoCard({ repo }: { repo: Repository }) {
  const [showBlocks, setShowBlocks] = useState(false);
  const groups = groupByScenario(repo.launchables);
  // A simple repo (one namespace, no Course) lists its activities flat — no
  // scenario headers to add where there's nothing to distinguish.
  const flat = groups.length <= 1 && !groups[0]?.course;

  return (
    <article className="lo-panel flex flex-col gap-3 p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground truncate min-w-0">
          <a className="hover:text-accent" href={studioHref(repo.origin, { tab: 'docs' })} title="Open in Studio">
            {repo.label}
          </a>
        </h3>
        <div className="flex items-center gap-2.5 shrink-0">
          {repo.forgeLink && <ForgeLinkIcon link={repo.forgeLink} />}
          <span className={`lo-chip ${repo.writable ? 'text-accent' : 'text-dimmed'}`}>
            {repo.writable ? 'Writable' : 'Read-only'}
          </span>
        </div>
      </div>

      {repo.description && <p className="text-sm text-secondary">{repo.description}</p>}

      <div className="flex flex-col gap-4">
        {repo.launchables.length === 0 && (
          <p className="text-sm text-dimmed py-2">No usable activities yet.</p>
        )}
        {flat
          ? groups[0]?.activities.map(l => <ActivityRow key={l.id} repo={repo} launchable={l} />)
          : groups.map(g => <ScenarioGroup key={g.namespace} repo={repo} group={g} />)}
      </div>

      {/* Building blocks: editable pieces composed into activities, never
          launched on their own. Below the fold — collapsed by default. */}
      {repo.internal.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <button
            className="flex items-center gap-1.5 text-sm text-secondary hover:text-foreground"
            onClick={() => setShowBlocks(v => !v)}
            aria-expanded={showBlocks}
          >
            <ChevronRight size={14} className={`transition-transform ${showBlocks ? 'rotate-90' : ''}`} aria-hidden />
            Building blocks <span className="text-dimmed">{repo.internal.length}</span>
          </button>
          {showBlocks && (
            <div className="pl-3 ml-1 mt-1 border-l border-border-subtle">
              {repo.internal.map(l => <ActivityRow key={l.id} repo={repo} launchable={l} />)}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1 mt-auto">
        {/* Raw origin lives here as a tooltip — present for the curious, never a banner. */}
        <p className="lo-muted text-xs truncate" title={repo.origin}>
          {repo.launchableCount} activit{repo.launchableCount === 1 ? 'y' : 'ies'}
          {repo.draftCount > 0 && ` · +${repo.draftCount} draft${repo.draftCount === 1 ? '' : 's'}`}
          {repo.internalCount > 0 && ` · ${repo.internalCount} building block${repo.internalCount === 1 ? '' : 's'}`}
          {repo.discipline && ` · ${repo.discipline}`}
        </p>
        {repo.writable && (
          <a className="lo-btn lo-btn--subtle lo-btn--sm shrink-0" href={studioHref(repo.origin)}>+ New file</a>
        )}
      </div>
    </article>
  );
}
