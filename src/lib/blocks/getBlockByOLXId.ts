// src/lib/blocks/getBlockByOLXId.ts
//
// Synchronous accessors for blocks by OLX ID.
//
// Blocks are looked up directly in props.idMap. Content must be loaded
// before rendering - there is no async fetching.
//
// OLX ID = static ID from markup: <Block id="myblockid">
// Redux ID = runtime ID with suffixes: myblockid_1, myblockid_2 (for repeated blocks)
//
import { refToOlxKey } from './idResolver';
import type { OlxJson, OlxReference, IdMap } from '@/lib/types';

interface PropsWithIdMap {
  idMap: IdMap;
}

/**
 * Get a block from the idMap by its OLX ID.
 *
 * Synchronous lookup - returns the block or undefined.
 * Content must already be in idMap before calling.
 *
 * @param props - Object containing idMap
 * @param id - The OLX ID to look up (can be null for optional lookups)
 * @returns The block entry, or undefined if not found
 */
export function getBlockByOLXId(props: PropsWithIdMap, id: OlxReference | string | null): OlxJson | undefined {
  if (id == null) {
    return undefined;
  }

  if (id === '') {
    console.warn('getBlockByOLXId: Called with empty string. Pass null instead if ID is optional.');
    return undefined;
  }

  const key = refToOlxKey(id);
  return props.idMap?.[key];
}

/**
 * Get multiple blocks from the idMap by their OLX IDs.
 *
 * Synchronous lookup - returns an array of blocks.
 *
 * @param props - Object containing idMap
 * @param ids - Array of OLX IDs to look up
 * @returns Array of block entries (undefined for blocks not found)
 */
export function getBlocksByOLXIds(props: PropsWithIdMap, ids: (OlxReference | string)[]): (OlxJson | undefined)[] {
  return ids.map(id => getBlockByOLXId(props, id));
}
