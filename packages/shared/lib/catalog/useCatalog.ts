'use client';
// packages/shared/lib/catalog/useCatalog.ts
//
// useCatalog — consume the get_repositories tool via Redux. The CONSUME end
// paired with tool.ts (advertise); both share schema.ts.
//
// Data flow: refreshCatalog() fetches via MCP and dispatches to Redux;
// useCatalogData() reads from Redux via useSelector. See state/catalog.ts.

import { useEffect } from 'react';
import { refreshCatalog, useCatalogData } from '@/lib/state/catalog';
import type { Repository } from '@/lib/catalog/schema';

export interface CatalogState {
  repositories: Repository[];
  loading: boolean;
  error: string | null;
}

/** The author catalog: every repository + its launchables, in one MCP call.
 *  Triggers the fetch on mount, reads from Redux.
 *
 *  HACK: Calls refreshCatalog (unconditional re-fetch) on every mount so
 *  edits made in Studio are visible when navigating to /catalog. This is a
 *  stopgap — the right fix is MCP notification push (see state/catalog.ts).
 *
 *  TODO: Switch to ensureCatalog (deduped) once server→client push is wired;
 *  the notification handler calls refreshCatalog, and the hook just ensures. */
export function useCatalog(include?: string[]): CatalogState {
  const args = include ? { include } : {};
  const argsKey = JSON.stringify(args);

  // HACK: unconditional re-fetch on mount — see docstring above.
  useEffect(() => {
    refreshCatalog(args);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argsKey]);

  // Read from Redux
  const entry = useCatalogData(argsKey);

  return {
    repositories: entry?.repositories ?? [],
    loading: !entry || entry.loadingState.status === 'loading',
    error: entry?.loadingState.status === 'error' ? (entry.error?.message ?? 'Unknown error') : null,
  };
}
