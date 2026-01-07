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
// NOTE: State is accessed via props.store. This enables replay mode where
// a different store provides historical state. The store is threaded through
// props from React components using useStore().
//
import { refToOlxKey } from './idResolver';
import { selectBlock } from '@/lib/state/olxjson';
import type { OlxJson, OlxReference } from '@/lib/types';
import type { Store } from 'redux';

interface PropsWithStore {
  store: Store;
  olxJsonSources?: string[];
}

/**
 * Get a block from Redux by its OLX ID.
 *
 * Synchronous lookup - returns the block or undefined.
 * Content must already be in Redux before calling.
 *
 * @param props - Props containing store and olxJsonSources
 * @param id - The OLX ID to look up (can be null for optional lookups)
 * @returns The block entry, or undefined if not found
 */
export function getBlockByOLXId(props: PropsWithStore, id: OlxReference | string | null): OlxJson | undefined {
  if (id == null) {
    return undefined;
  }

  if (id === '') {
    console.warn('getBlockByOLXId: Called with empty string. Pass null instead if ID is optional.');
    return undefined;
  }

  const key = refToOlxKey(id);
  const sources = props?.olxJsonSources ?? ['content'];
  const state = props.store.getState();
  return selectBlock(state, sources, key);
}

/**
 * Get multiple blocks from Redux by their OLX IDs.
 *
 * Synchronous lookup - returns an array of blocks.
 *
 * @param props - Props containing store and olxJsonSources
 * @param ids - Array of OLX IDs to look up
 * @returns Array of block entries (undefined for blocks not found)
 */
export function getBlocksByOLXIds(props: PropsWithStore, ids: (OlxReference | string)[]): (OlxJson | undefined)[] {
  return ids.map(id => getBlockByOLXId(props, id));
}
