// src/lib/blocks/useBlockByOLXId.ts
//
// React hooks for accessing blocks by OLX ID during render.
//
// Synchronous lookup - blocks must already be in idMap.
//
// For components that render children, prefer useKids/useBlock from render.tsx.
// These hooks are for when you need the raw OlxJson, not the rendered output.
//
'use client';

import { getBlockByOLXId, getBlocksByOLXIds } from './getBlockByOLXId';
import type { RuntimeProps, OlxJson, OlxReference } from '@/lib/types';

/**
 * Hook to get a block's OlxJson by ID.
 *
 * Synchronous - returns immediately. Block must be in idMap.
 * For optional blocks, pass null and check for undefined result.
 */
export function useBlockByOLXId(props: RuntimeProps, id: OlxReference | null): OlxJson | undefined {
  if (!id) return undefined;
  return getBlockByOLXId(props, id);
}

/**
 * Hook to get multiple blocks' OlxJson by IDs.
 *
 * Synchronous - returns immediately. Blocks must be in idMap.
 */
export function useBlocksByOLXIds(props: RuntimeProps, ids: OlxReference[]): (OlxJson | undefined)[] {
  return getBlocksByOLXIds(props, ids);
}
