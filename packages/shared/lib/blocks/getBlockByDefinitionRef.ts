// packages/shared/lib/blocks/getBlockByDefinitionRef.ts
//
// Synchronous accessors for block definitions.
//
// Blocks are looked up from Redux state. Content must be loaded
// before rendering - there is no async fetching.
//
// Authored id= values enter this API as DefinitionRefs. They are qualified
// against the current namespace before looking up the canonical DefinitionKey.
//
// NOTE: State is accessed via props.store. This enables replay mode where
// a different store provides historical state. The store is threaded through
// props from React components using useStore().
//
import { qualifyDefinitionRef } from '../types/id-grammar';
import { selectBlock } from '@/lib/state/olxjson';
import type { OlxJson, ContentNamespace, DefinitionRef, UserLocale } from '@/lib/types';
import type { Store } from 'redux';

interface PropsWithStore {
  runtime: { store: Store; olxJsonSources?: string[]; ns: ContentNamespace; locale?: { code: UserLocale } };
}

/**
 * Get a block from Redux by its definition ref.
 *
 * Synchronous lookup - returns the block or undefined.
 * Content must already be in Redux before calling.
 *
 * @param props - Props containing runtime context with store and olxJsonSources
 * @param definitionRef - The definition ref to look up (can be null for optional lookups)
 * @returns The block entry, or undefined if not found
 */
export function getBlockByDefinitionRef(props: PropsWithStore, definitionRef: DefinitionRef | null): OlxJson | undefined {
  if (definitionRef == null) {
    return undefined;
  }

  if (definitionRef === '') {
    console.warn('getBlockByDefinitionRef: Called with empty string. Pass null instead if the ref is optional.');
    return undefined;
  }

  const definitionKey = qualifyDefinitionRef(definitionRef, props.runtime.ns);
  const store = props.runtime.store;
  const sources = props.runtime.olxJsonSources ?? ['content'];
  const locale = props.runtime.locale?.code;
  if (!locale) {
    return undefined;
  }
  const state = store.getState();
  return selectBlock(state, sources, definitionKey, locale);
}

/**
 * Get multiple blocks from Redux by their definition refs.
 *
 * Synchronous lookup - returns an array of blocks.
 *
 * @param props - Props containing store and olxJsonSources
 * @param definitionRefs - Definition refs to look up
 * @returns Array of block entries (undefined for blocks not found)
 */
export function getBlocksByDefinitionRefs(props: PropsWithStore, definitionRefs: DefinitionRef[]): (OlxJson | undefined)[] {
  return definitionRefs.map(definitionRef => getBlockByDefinitionRef(props, definitionRef));
}
