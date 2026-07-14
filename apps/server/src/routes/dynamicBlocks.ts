// apps/server/src/routes/dynamicBlocks.ts
//
// GET /api/dynamic-blocks — the client's bootstrap list of runtime-loaded
// blocks (docs/dynamic-blocks.md). Each entry carries a Vite /@fs/ moduleUrl
// the browser can import(), the current registry version, and an error string
// for blueprints that failed to load server-side.

import type { Context } from 'hono';
import { loadedBlocks } from '../dynamicBlocks.js';
import { getRegistryVersion } from '@/lib/blocks/dynamicRegistry';

export function handleDynamicBlocks(c: Context) {
  const version = getRegistryVersion();
  const blocks = loadedBlocks().map((b) => ({
    tag: b.tag,
    // Vite serves absolute filesystem paths under /@fs (fs.allow was extended
    // for this directory when the block was loaded).
    moduleUrl: `/@fs${b.blueprintPath}`,
    version,
    ...(b.error ? { error: b.error } : {}),
  }));
  return c.json(blocks);
}
