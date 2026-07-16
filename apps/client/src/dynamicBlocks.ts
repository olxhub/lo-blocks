// apps/client/src/dynamicBlocks.ts
//
// Client side of dynamic block loading (docs/dynamic-blocks.md). Runs before
// the first render: fetch the server's list of runtime-loaded blocks, import
// each blueprint module through Vite (which transforms TS, resolves @/, and
// rewrites the componentLoader's import so the component arrives through Vite
// too), and register it into the shared BLOCK_REGISTRY.
//
// Registering before App.tsx runs store.init() means the store's reducer
// registration picks the dynamic blocks up automatically — no re-init needed
// for the initial load.

import { registerDynamicBlock } from '@/lib/blocks/dynamicRegistry';
import { createErrorBlock } from '@/lib/blocks/dynamicBlockError';
import type { OLXTag } from '@/lib/types';

interface DynamicBlockEntry {
  tag: OLXTag;
  moduleUrl: string;
  version: number;
  error?: string;
}

/**
 * Fetch and register every dynamic block. Silent no-op when the endpoint is
 * absent (prod) or the list is empty. A single block failing to import
 * becomes an error-placeholder block; it never aborts the others.
 */
export async function loadDynamicBlocks(): Promise<void> {
  let entries: DynamicBlockEntry[];
  try {
    const res = await fetch('/api/dynamic-blocks');
    if (!res.ok) return; // 404 in prod, etc.
    entries = await res.json();
  } catch {
    return; // endpoint unavailable — nothing to load
  }
  if (!Array.isArray(entries) || entries.length === 0) return;

  for (const entry of entries) {
    // Server already reported this blueprint as broken — render its message.
    if (entry.error) {
      registerDynamicBlock(createErrorBlock(entry.tag, entry.error), entry.moduleUrl);
      continue;
    }
    try {
      const mod = await import(/* @vite-ignore */ entry.moduleUrl);
      registerDynamicBlock(mod.default, entry.moduleUrl);
    } catch (err: any) {
      const message = err?.message ?? String(err);
      registerDynamicBlock(createErrorBlock(entry.tag, message), entry.moduleUrl);
    }
  }
}
