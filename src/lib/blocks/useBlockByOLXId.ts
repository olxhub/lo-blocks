// src/lib/blocks/useBlockByOLXId.ts
//
// React hooks for accessing blocks by OLX ID during render.
//
// Uses React 19's use() hook to unwrap promises from getBlockByOLXId.
// Currently resolves instantly (sync idMap lookup), but when server fetching
// is added, these will suspend until data arrives.
//
// Suspense boundary should be at RenderOLX level (not per-component).
//
// OLX ID = static ID from markup: <Block id="myblockid">
// Redux ID = runtime ID with suffixes: myblockid_1, myblockid_2
//
'use client';

import { use } from 'react';
import { getBlockByOLXId, getBlocksByOLXIds } from './getBlockByOLXId';
import type { RuntimeProps, OlxJson, OlxReference } from '@/lib/types';

export function useBlockByOLXId(props: RuntimeProps, id: OlxReference | null): OlxJson | undefined {
  if (!id) return undefined;
  return use(getBlockByOLXId(props, id));
}

export function useBlocksByOLXIds(props: RuntimeProps, ids: OlxReference[]): (OlxJson | undefined)[] {
  return use(getBlocksByOLXIds(props, ids));
}
