'use client';
// packages/shared/components/blocks/authoring/Catalog/repoCard.tsx
//
// A repository card. Two modes controlled by the `compact` prop:
//
// compact=true (default, catalog listing):
//   Header + up to COMPACT_LIMIT activity titles (no descriptions, no actions,
//   descriptions as browser tooltips). "… and N more" expands the activity list
//   inline; repo title links to /repo/:origin for the full page.
//
// compact=false (full repo page):
//   All activities with descriptions and hover actions, building blocks
//   section, footer with metadata and "+ New file".
//
// Rendered in two contexts:
//   1. Direct child of CatalogView — receives `repo` as a React prop, with
//      scoped RuntimeProps from scopedRepoProps(props, origin).
//   2. Via block pipeline (RenderOLX) at /repo/:origin — no `repo` prop;
//      reads `origin` from its OLX attribute and looks up the repo.
//
// State: expand/collapse fields are component-scoped, keyed per repo via
// the idPrefix (set by scopedRepoProps or repoIdPrefix). Each instance
// gets a unique Redux key.

import { ChevronRight } from 'lucide-react';
import type { RuntimeProps } from '@/lib/types';
import type { Repository } from '@/lib/types';
import { groupByScenario } from './group';
import { studioHref, previewHref, repoDetailHref } from './links';
import { useFieldState } from '@/lib/state/redux';
import { useRepoByOrigin } from '@/lib/state/catalog';
import { DisplayError } from '@/lib/util/debug';
import { repoCardFields, compactItems, type CompactItem } from './locals';
import ScenarioGroup from './scenarioGroup';
import ActivityRow from './activityRow';
import ForgeLinkIcon from './forgeLinkIcon';

const COMPACT_LIMIT = 5;

/** Render a compact list of items with a budget of `limit` activities.
 *  Headings are always shown (don't count against the budget); activities
 *  beyond the budget are omitted. */
function CompactList({ items, limit, repo }: { items: CompactItem[]; limit: number; repo: Repository }) {
  let activityCount = 0;
  const visible: CompactItem[] = [];
  for (const item of items) {
    if (item.kind === 'heading') {
      visible.push(item);
    } else {
      if (activityCount >= limit) break;
      visible.push(item);
      activityCount++;
    }
  }
  return (
    <ul className="flex flex-col gap-1">
      {visible.map((item, i) =>
        item.kind === 'heading' ? (
          <li key={item.course?.id ?? `heading-${i}`} className="text-sm font-semibold text-secondary pt-1 first:pt-0 flex items-baseline gap-1.5">
            {item.course ? (
              <a href={previewHref(item.course.id)} className="hover:text-accent" title={item.course.description || undefined}>
                {item.label}
              </a>
            ) : (
              item.label
            )}
            {item.course?.status === 'draft' && <span className="lo-chip text-warning text-xs">Draft</span>}
          </li>
        ) : (
          <li key={item.launchable.id} className="group flex items-baseline gap-2 pl-3">
            <a
              href={previewHref(item.launchable.id)}
              className="flex-1 min-w-0 text-sm font-medium text-foreground hover:text-accent"
              title={item.launchable.description || undefined}
            >
              {item.launchable.title}
            </a>
            {item.launchable.status === 'draft' && <span className="lo-chip text-warning text-xs">Draft</span>}
            <a
              className="text-sm text-secondary hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
              href={studioHref(repo.origin, { file: item.launchable.path })}
            >
              {repo.writable ? 'Edit' : 'Open'}
            </a>
          </li>
        )
      )}
    </ul>
  );
}

/** Props: scoped RuntimeProps + optional repo object + compact flag.
 *  When `repo` is not provided, reads `origin` from props and looks it up. */
export default function RepoCard(props: RuntimeProps) {
  // Determine the repo: direct prop (CatalogView) or lookup (block pipeline).
  const directRepo: Repository | undefined = props.repo;
  const origin = directRepo?.origin ?? props.origin ?? null;

  // When rendered via the block pipeline (standalone), look up the repo from
  // Redux. The page component (e.g. RepoDetailPage) is responsible for
  // triggering the catalog fetch via useCatalog — RepoCard just reads state.
  const lookedUpRepo = useRepoByOrigin(origin ?? '');

  const repo = directRepo ?? lookedUpRepo;
  // props.compact arrives as a real boolean via the block pipeline (RepoCard's
  // z_olx_boolean.default(true) attribute schema coerces "true"/"false" before
  // this component sees it); the direct-React-prop path (CatalogView,
  // SearchResults) never sets it, so it's undefined here — default to true.
  const compact = props.compact ?? true;

  // Component-scoped fields — each repo card gets its own Redux key via
  // the scoped idPrefix (set by scopedRepoProps or repoIdPrefix).
  const [expanded, setExpanded] = useFieldState(props, repoCardFields.expanded, false);
  const [showBlocks, setShowBlocks] = useFieldState(props, repoCardFields.showBlocks, false);

  // When rendered standalone (no direct repo prop), handle not-found.
  if (!repo) {
    return (
      <p className="text-secondary">
        No repository found{origin ? <> for <code className="text-xs">{origin}</code></> : ''}.
      </p>
    );
  }

  const groups = groupByScenario(repo.launchables);
  const flat = groups.length <= 1 && !groups[0]?.course;
  const items = compactItems(groups, flat);
  // Count all launchables (courses + activities), not just non-course items.
  // A course-only repo is still real content — it's previewable and openable.
  const totalCount = repo.launchables.length;
  // Overflow uses the same budget CompactList applies: headings render for
  // free, so only activity items consume COMPACT_LIMIT.
  const activityCount = items.filter(item => item.kind === 'activity').length;
  const overflows = compact && activityCount > COMPACT_LIMIT;

  // Show full activity listing when not compact, or when expanded inline.
  const showFull = !compact || expanded;

  return (
    <article className="lo-panel flex flex-col gap-3 p-5 transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground truncate min-w-0">
          {compact ? (
            <a className="hover:text-accent" href={repoDetailHref(repo.origin)}>
              {repo.label}
            </a>
          ) : (
            <a className="hover:text-accent" href={studioHref(repo.origin, { tab: 'docs' })} title="Open in Studio">
              {repo.label}
            </a>
          )}
        </h3>
        <div className="flex items-center gap-2.5 shrink-0">
          {repo.forgeLink && <ForgeLinkIcon link={repo.forgeLink} />}
          <span className={`lo-chip ${repo.writable ? 'text-accent' : 'text-dimmed'}`}>
            {repo.writable ? 'Writable' : 'Read-only'}
          </span>
        </div>
      </div>

      {repo.description && <p className="text-sm text-secondary">{repo.description}</p>}

      {/* Activity listing */}
      <div className="flex flex-col gap-4">
        {repo.error && <DisplayError {...repo.error} />}
        {!repo.error && totalCount === 0 && (
          <p className="text-sm text-dimmed py-2">No usable activities yet.</p>
        )}

        {compact && !showFull && totalCount > 0 && (
          /* Compact title list — headings + activity titles with budget */
          <CompactList items={items} limit={COMPACT_LIMIT} repo={repo} />
        )}

        {showFull && totalCount > 0 && (
          /* Full activity listing — ActivityRow/ScenarioGroup with descriptions and actions */
          flat
            ? groups[0]?.activities.map(l => <ActivityRow key={l.id} repo={repo} launchable={l} />)
            : groups.map(g => <ScenarioGroup key={g.namespace} repo={repo} group={g} />)
        )}
      </div>

      {/* Expand/collapse toggle — only in compact mode when there are overflow items */}
      {compact && (overflows || expanded) && (
        <button
          className="flex items-center gap-1.5 text-sm text-secondary hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={!!expanded}
        >
          <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden />
          {expanded ? 'Collapse' : `… and ${activityCount - COMPACT_LIMIT} more`}
        </button>
      )}

      {/* Building blocks — only in full mode */}
      {!compact && repo.internal.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <button
            className="flex items-center gap-1.5 text-sm text-secondary hover:text-foreground"
            onClick={() => setShowBlocks(!showBlocks)}
            aria-expanded={!!showBlocks}
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

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pt-1 mt-auto">
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
