// packages/shared/lib/docs/useBlockDocs.ts
//
// React hook: block documentation from the get_blocks MCP tool, via the
// Redux docs slice (state/docs.ts — catalog's twin, same caveats).

'use client';

import { useEffect } from 'react';
import { ensureDocs, useDocsData } from '@/lib/state/docs';
import type { BlockDocRecord } from '@/lib/types';

// Named UseBlockDocsResult (not DocsState) — lib/types/core.ts owns the
// canonical slice type names.
export interface UseBlockDocsResult {
  blocks: BlockDocRecord[];
  total: number;
  loading: boolean;
  error: string | null;
}

/** Fetch (deduped) and read block documentation.
 *
 *  @param filter - block names and/or categories (OR-matched by get_blocks);
 *                  omit for all non-internal blocks.
 *  @param include - extra detail per block ('readme', 'examples',
 *                  'attributes', ... — see get_blocks in docs/tools.ts). */
export function useBlockDocs(filter?: string[], include?: string[]): UseBlockDocsResult {
  // args is rebuilt from argsKey inside the effect (rather than closed over
  // directly) so the effect's dependency array can honestly list argsKey —
  // a string — instead of an object that's a new reference every render.
  const argsKey = JSON.stringify({
    ...(filter?.length ? { filter } : {}),
    ...(include?.length ? { include } : {}),
  });

  useEffect(() => {
    ensureDocs(JSON.parse(argsKey));
  }, [argsKey]);

  const entry = useDocsData(argsKey);
  return {
    blocks: entry?.blocks ?? [],
    total: entry?.blocks.length ?? 0,
    loading: !entry || entry.loadingState.status === 'loading',
    error: entry?.loadingState.status === 'error' ? (entry.error?.message ?? 'Unknown error') : null,
  };
}
