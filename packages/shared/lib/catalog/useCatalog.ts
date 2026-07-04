'use client';
// packages/shared/lib/catalog/useCatalog.ts
//
// useCatalog — consume the get_repositories tool via Redux. The CONSUME end
// paired with tool.ts (advertise); both share schema.ts.
//
// Data flow: refreshCatalog() fetches via MCP and dispatches to Redux;
// useCatalogData() reads from Redux via useSelector. See state/catalog.ts.

import { useEffect } from 'react';
import { ensureCatalog, useCatalogData } from '@/lib/state/catalog';
import type { Repository } from '@/lib/types';

// Named UseCatalogResult (not CatalogState) — lib/types/core.ts already
// exports a canonical CatalogState (the Redux slice shape), which this is not.
export interface UseCatalogResult {
  repositories: Repository[];
  loading: boolean;
  error: string | null;
}

/** The author catalog: every repository + its launchables, in one MCP call.
 *  Triggers the fetch on mount (deduped), reads from Redux.
 *
 *  HACK: Uses ensureCatalog (deduped) so repeat mounts don't re-fetch, but
 *  edits made in Studio are NOT visible until a hard reload. This is a
 *  stopgap — the right fix is MCP notification push (see state/catalog.ts).
 *
 *  TODO: Wire MCP notification subscription; the notification handler calls
 *  refreshCatalog, and the hook stays with ensureCatalog (deduped). */
export function useCatalog(include?: string[]): UseCatalogResult {
  // args is rebuilt from argsKey inside the effect (rather than closed over
  // directly) so the effect's dependency array can honestly list argsKey —
  // a string — instead of an object that's a new reference every render.
  const argsKey = JSON.stringify(include ? { drafts: 'include', include } : { drafts: 'include' });

  // HACK: deduped fetch on mount — see docstring above. Once MCP
  // notifications are wired, the server pushes invalidation and this
  // just ensures the initial load.
  useEffect(() => {
    ensureCatalog(JSON.parse(argsKey));
  }, [argsKey]);

  // Read from Redux
  const entry = useCatalogData(argsKey);

  return {
    repositories: entry?.repositories ?? [],
    loading: !entry || entry.loadingState.status === 'loading',
    error: entry?.loadingState.status === 'error' ? (entry.error?.message ?? 'Unknown error') : null,
  };
}
