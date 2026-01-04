// src/lib/blocks/getBlockByOLXId.ts
//
// Synchronous accessors for blocks by OLX ID.
//
// Blocks are looked up from Redux state. Content must be loaded
// before rendering - there is no async fetching.
//
// OLX ID = static ID from markup: <Block id="myblockid">
// Redux ID = runtime ID with suffixes: myblockid_1, myblockid_2 (for repeated blocks)
//
import { refToOlxKey } from './idResolver';
import { selectBlock } from '@/lib/state/olxjson';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';
import type { OlxJson, OlxReference } from '@/lib/types';

interface PropsWithSources {
  olxJsonSources?: string[];
}

/**
 * Get a block from Redux by its OLX ID.
 *
 * Synchronous lookup - returns the block or undefined.
 * Content must already be in Redux before calling.
 *
 * @param props - Object containing olxJsonSources (optional, defaults to ['content'])
 * @param id - The OLX ID to look up (can be null for optional lookups)
 * @returns The block entry, or undefined if not found
 */
export function getBlockByOLXId(props: PropsWithSources, id: OlxReference | string | null): OlxJson | undefined {
  if (id == null) {
    return undefined;
  }

  if (id === '') {
    console.warn('getBlockByOLXId: Called with empty string. Pass null instead if ID is optional.');
    return undefined;
  }

  const key = refToOlxKey(id);
  const sources = props?.olxJsonSources ?? ['content'];
  return selectBlock(reduxLogger.store?.getState(), sources, key);
}

/**
 * Get multiple blocks from Redux by their OLX IDs.
 *
 * Synchronous lookup - returns an array of blocks.
 *
 * @param props - Object containing olxJsonSources (optional)
 * @param ids - Array of OLX IDs to look up
 * @returns Array of block entries (undefined for blocks not found)
 */
export function getBlocksByOLXIds(props: PropsWithSources, ids: (OlxReference | string)[]): (OlxJson | undefined)[] {
  return ids.map(id => getBlockByOLXId(props, id));
}
