// src/lib/blocks/useBlockByOLXId.ts
//
// React hooks for accessing blocks by OLX ID during render.
//
// These wrap the async getBlockByOLXId functions with React's use() hook,
// enabling Suspense-based data fetching. Currently resolves instantly
// (sync idMap lookup), but the pattern supports future server fetching.
//
// OLX ID = static ID from markup: <Block id="myblockid">
// Redux ID = runtime ID with suffixes: myblockid_1, myblockid_2 (for repeated blocks)
//
// Usage:
//   const block = useBlockByOLXId(props, 'some-block-id');
//   if (!block) return <Error />;
//   // use block...
//
'use client';

import { use } from 'react';
import { getBlockByOLXId, getBlocksByOLXIds } from './getBlockByOLXId';
import type { PropType, OlxJson } from '@/lib/types';

/**
 * Hook to get a block by its OLX ID during render.
 *
 * Uses React's use() hook internally, so requires Suspense boundaries
 * for async resolution. Currently resolves instantly (idMap lookup).
 *
 * @param props - Component props containing idMap
 * @param id - The OLX ID to look up (static ID from markup, not Redux ID)
 * @returns The block entry, or undefined if not found
 */
export function useBlockByOLXId(props: PropType, id: string): OlxJson | undefined {
  return use(getBlockByOLXId(props, id));
}

/**
 * Hook to get multiple blocks by their OLX IDs during render.
 *
 * Uses React's use() hook with Promise.all internally.
 *
 * @param props - Component props containing idMap
 * @param ids - Array of OLX IDs to look up
 * @returns Array of block entries (undefined for any not found)
 */
export function useBlocksByOLXIds(props: PropType, ids: string[]): (OlxJson | undefined)[] {
  return use(getBlocksByOLXIds(props, ids));
}
