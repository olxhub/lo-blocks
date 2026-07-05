// packages/shared/lib/docs/useBlockDocs.ts
//
// React hook: block documentation from the get_blocks MCP tool, via the
// Redux docs slice (state/docs.ts — catalog's twin, same caveats).

'use client';

import { useEffect } from 'react';
import { ensureDocs, ensureFormats, formatsArgsKey, useDocsData } from '@/lib/state/docs';
import type { BlockDocRecord, FormatDocRecord } from '@/lib/types';

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

export interface UseFormatDocsResult {
  formats: FormatDocRecord[];
  loading: boolean;
  error: string | null;
}

/** Fetch (deduped) and read content-format documentation (get_formats —
 *  PEG grammars, YAML schemas). Same slice and dedup semantics as
 *  useBlockDocs; keys are `formats:`-prefixed so the two never collide.
 *
 *  @param filter - format names, extensions, or block names (OR-matched);
 *                  omit for all formats.
 *  @param include - extra detail per format ('readme', 'spec', 'preview',
 *                  'examples' — see get_formats in docs/tools.ts). */
export function useFormatDocs(filter?: string[], include?: string[]): UseFormatDocsResult {
  // Same honest-deps construction as useBlockDocs above.
  const argsJson = JSON.stringify({
    ...(filter?.length ? { filter } : {}),
    ...(include?.length ? { include } : {}),
  });

  useEffect(() => {
    ensureFormats(JSON.parse(argsJson));
  }, [argsJson]);

  const entry = useDocsData(formatsArgsKey(JSON.parse(argsJson)));
  return {
    formats: entry?.formats ?? [],
    loading: !entry || entry.loadingState.status === 'loading',
    error: entry?.loadingState.status === 'error' ? (entry.error?.message ?? 'Unknown error') : null,
  };
}
