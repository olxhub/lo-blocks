'use client';
// packages/shared/lib/catalog/useCatalog.ts
//
// useCatalog — consume the get_repositories tool. The CONSUME end paired with
// tool.ts (advertise); both share schema.ts. See docs/mcp-authoring.md.

import { useMCP } from '@/lib/mcp/useMCP';
import {
  GetRepositoriesOutput,
  type GetRepositoriesResult,
  type Repository,
} from '@/lib/catalog/schema';

export interface CatalogState {
  repositories: Repository[];
  loading: boolean;
  error: string | null;
}

/** The author catalog: every repository + its launchables, in one MCP call.
 *  The result is validated against the tool's output schema client-side (the
 *  MCP text contract gives no runtime guarantee). */
export function useCatalog(include?: string[]): CatalogState {
  const args = include ? { include } : {};
  const { data, loading, error } = useMCP<GetRepositoriesResult>('get_repositories', args, {
    parse: (raw) => GetRepositoriesOutput.parse(raw),
  });
  return { repositories: data?.repositories ?? [], loading, error };
}
