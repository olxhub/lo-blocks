// apps/server/src/dynamicBlocks.ts
//
// Server side of dynamic block loading (docs/dynamic-blocks.md, prototype
// scope). Discovers blueprint files in a local directory, loads each through
// the Vite dev server's SSR module loader, validates it, and registers it
// into the shared BLOCK_REGISTRY. Per-file failures become error-placeholder
// blocks — a bad block never crashes the server.
//
// SERVER-ONLY: reads the filesystem and holds the Vite instance.
//
// The MCP `loadBlocks` tool (gated by the `dynamicBlockLoading` PMSS flag) is
// the front door; `/api/dynamic-blocks` (routes/dynamicBlocks.ts) reads the
// snapshot this module keeps so the client can import the same files.

import fs from 'node:fs';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import {
  registerDynamicBlock,
  unregisterDynamicBlock,
  getRegistryVersion,
  setReducerRefresh,
} from '@/lib/blocks/dynamicRegistry';
import { createErrorBlock } from '@/lib/blocks/dynamicBlockError';
import { registerAllowedContentDir } from '@/lib/lofs/allowedDirs';
import { resetContentSnapshot } from '@/lib/content/syncContentFromStorage';
import { getConfigBool } from '@/lib/config';
import { initReducers } from '@/lib/state/store';
import { fieldInfosFrom } from '@/lib/state/fields';
import { chatFields } from '@/lib/state/chatFields';
import { editorFields } from '@/lib/state/editorFields';
import type { LoBlock, OLXTag } from '@/lib/types';
import type { ToolRegistry } from '@/lib/mcp/registry';
import { z } from 'zod';

// Server-side reducer refresh mirrors materialization.ts: rebuild the field
// reducer map over the (now larger) registry plus the app-level fields with
// no owning block, so a dynamic block's field events reduce server-side too.
setReducerRefresh(() =>
  initReducers(BLOCK_REGISTRY, [
    ...fieldInfosFrom(chatFields),
    ...fieldInfosFrom(editorFields),
  ]),
);

// Blueprint files: capitalized, JS/TS, not `_`-prefixed component files —
// the same convention as the static registry (generateBlockRegistry.js).
const BLUEPRINT_PATTERN = /^[A-Z].*\.(jsx|tsx|js|ts)$/;

/** One loaded blueprint: enough to list it and to re-import it on the client. */
export interface LoadedBlock {
  tag: OLXTag;
  /** Absolute path to the blueprint file. */
  blueprintPath: string;
  /** The directory the load was requested for (for reload/unload). */
  sourceDir: string;
  /** Present when the blueprint failed to load — surfaced to the author. */
  error?: string;
}

// tag → loaded blueprint. Module-level snapshot: survives across requests so
// /api/dynamic-blocks and reloads can consult it.
const loaded = new Map<OLXTag, LoadedBlock>();

let viteServer: ViteDevServer | undefined;

/** Hand the block loader the Vite dev instance (called from server.ts once
 *  Vite exists). Without it, loading fails with a clear message. */
export function setViteServer(vite: ViteDevServer): void {
  viteServer = vite;
}

/** The current snapshot, for /api/dynamic-blocks. */
export function loadedBlocks(): LoadedBlock[] {
  return [...loaded.values()];
}

/** Recursively collect blueprint files under `dir`, skipping node_modules. */
function findBlueprints(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findBlueprints(full));
    } else if (entry.isFile() && BLUEPRINT_PATTERN.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

export interface LoadBlocksResult {
  version: number;
  loaded: Array<{ tag: OLXTag; blueprintPath: string; error?: string }>;
}

/**
 * Load every blueprint in `dir` into the registry. Returns the loaded tags
 * and any per-file errors. Never throws for a bad blueprint — that becomes an
 * error-placeholder block. Throws only for operator errors (no Vite, missing
 * directory) so the caller can report them.
 */
export async function loadBlocksFromDir(dir: string): Promise<LoadBlocksResult> {
  if (!viteServer) {
    throw new Error(
      'Dynamic block loading is unavailable: the Vite dev server is not ' +
      'running. Dynamic loading is a dev-mode feature (see docs/dynamic-blocks.md).'
    );
  }

  const absDir = path.resolve(dir);
  const stat = fs.existsSync(absDir) && fs.statSync(absDir);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Not a directory: ${absDir}`);
  }

  // Let Vite serve the blueprint/component files to the browser over /@fs.
  registerFsAllow(absDir);
  // Let the file provider read sidecars (docs/examples) from here too.
  registerAllowedContentDir(absDir);

  const results: LoadBlocksResult['loaded'] = [];
  for (const blueprintPath of findBlueprints(absDir)) {
    // The registry keys on block.name, which by convention matches the
    // filename — but only the block knows its real tag. The filename is the
    // fallback for blueprints that fail before we can ask them, and for
    // unregistering a previous registration of this file (a renamed block
    // must not leave its old tag behind).
    const filenameTag = path.basename(blueprintPath, path.extname(blueprintPath)) as OLXTag;
    const previous = [...loaded.values()].find((b) => b.blueprintPath === blueprintPath);
    try {
      const mod = await viteServer.ssrLoadModule(blueprintPath);
      const block = mod.default as LoBlock;
      if (previous && previous.tag !== block.name) {
        unregisterDynamicBlock(previous.tag);
        loaded.delete(previous.tag);
      }
      registerDynamicBlock(block, blueprintPath);
      loaded.set(block.name, { tag: block.name, blueprintPath, sourceDir: absDir });
      results.push({ tag: block.name, blueprintPath });
    } catch (err: any) {
      const message = err?.message ?? String(err);
      const tag = previous?.tag ?? filenameTag;
      // Errors are content: register a placeholder so the tag still renders
      // (with the message) instead of vanishing or crashing the server.
      unregisterDynamicBlock(tag);
      registerDynamicBlock(createErrorBlock(tag, message), blueprintPath);
      loaded.set(tag, { tag, blueprintPath, sourceDir: absDir, error: message });
      results.push({ tag, blueprintPath, error: message });
    }
  }

  // Content parsed while these tags were unknown has its errors cached in
  // the content snapshot; no file change will ever flush them. Re-parse.
  if (results.length > 0) resetContentSnapshot();

  return { version: getRegistryVersion(), loaded: results };
}

/** Add a directory to Vite's fs allow-list so /@fs/<dir> is servable. */
function registerFsAllow(absDir: string): void {
  const allow = viteServer!.config.server.fs.allow;
  if (!allow.includes(absDir)) allow.push(absDir);
}

// ---------------------------------------------------------------------------
// MCP tool
// ---------------------------------------------------------------------------

const LoadBlocksInput = z.object({
  source: z.string().describe(
    'Local directory containing block blueprints (capitalized Name.ts files). ' +
    'Git URLs are a later phase.'
  ),
});

/**
 * Register the `loadBlocks` MCP tool. Gated by the `dynamicBlockLoading` PMSS
 * flag: refuses with a clear message when the deployment has not opted in
 * (dynamic blocks run untrusted code on the server and in every browser).
 */
export function registerDynamicBlockTools(registry: ToolRegistry): void {
  registry.register(
    'loadBlocks',
    {
      description:
        'Load Learning Observer blocks from a local directory at runtime and ' +
        'register them so they can be used in OLX. Returns the loaded tags and ' +
        'any per-file errors. Requires the dynamicBlockLoading flag.',
      input: LoadBlocksInput,
    },
    async ({ source }) => {
      if (!getConfigBool('dynamicBlockLoading')) {
        throw new Error(
          'Dynamic block loading is disabled on this deployment. It runs ' +
          'untrusted code on the server and in every browser, so it is off ' +
          'by default. Enable `dynamicBlockLoading` in PMSS config to allow it.'
        );
      }
      return loadBlocksFromDir(source);
    },
  );
}
