// src/lib/blocks/useBlockByOLXId.ts
//
// React hooks for accessing blocks by OLX ID during render.
//
// Currently sync (direct idMap lookup). When Suspense boundaries are added,
// these will switch to: return use(getBlockByOLXId(props, id));
//
// OLX ID = static ID from markup: <Block id="myblockid">
// Redux ID = runtime ID with suffixes: myblockid_1, myblockid_2
//
'use client';

import { idMapKey } from './idResolver';
import type { PropType, OlxJson } from '@/lib/types';

// TODO: When Suspense boundaries are in place, switch to:
// import { use } from 'react';
// import { getBlockByOLXId, getBlocksByOLXIds } from './getBlockByOLXId';
// return use(getBlockByOLXId(props, id));

export function useBlockByOLXId(props: PropType, id: string): OlxJson | undefined {
  return props.idMap[idMapKey(id)];
}

export function useBlocksByOLXIds(props: PropType, ids: string[]): (OlxJson | undefined)[] {
  return ids.map(id => props.idMap[idMapKey(id)]);
}
