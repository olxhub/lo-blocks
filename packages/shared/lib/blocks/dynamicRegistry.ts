// packages/shared/lib/blocks/dynamicRegistry.ts
//
// Runtime block registration — the shared half of dynamic block loading
// (docs/dynamic-blocks.md). Used identically on the server (after
// ssrLoadModule) and in the browser (after import(moduleUrl)): both mutate
// the one flat BLOCK_REGISTRY that parseOLX, render, and reducer init read.
//
// The static registry (blockRegistryAutogen.ts) is populated at build time;
// this layer adds blocks discovered at runtime on top of it. It is
// deliberately flat, error-on-collision registration — namespace-qualified
// resolution is a later phase (see the design doc).
//
// Reducer re-registration is threaded through `setReducerRefresh`, so this
// module stays free of any client-vs-server store wiring: each side installs
// its own refresh (client: reduxLogger + collectEventTypes; server:
// initReducers) once at startup.

import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import type { LoBlock, OLXTag } from '@/lib/types';

/** tag → the source path the dynamic block was loaded from. The source path
 *  distinguishes a *reload* (same file, re-registered) from a genuine
 *  collision (two different files claiming one tag). '' means "source
 *  unknown" (e.g. a direct test registration). */
const dynamicTags = new Map<OLXTag, string>();

/** Bumped on every registry mutation. Clients poll/receive this to know when
 *  to re-import (poll loop is a later phase; the counter exists now). */
let registryVersion = 0;

let reducerRefresh: () => void = () => {};

/** Install the reducer re-registration hook (called once at startup on each
 *  side). Kept a callback so this module imports no store internals. */
export function setReducerRefresh(fn: () => void): void {
  reducerRefresh = fn;
}

export function getRegistryVersion(): number {
  return registryVersion;
}

/** The tags currently registered dynamically (not the static ones). */
export function dynamicBlockTags(): OLXTag[] {
  return [...dynamicTags.keys()];
}

/**
 * Register a runtime-loaded block into BLOCK_REGISTRY.
 *
 * Rules (author-facing errors, per the design doc):
 *   - the value must be a real block (`_isBlock`);
 *   - a dynamic block may never shadow a static/core block;
 *   - two *different* sources may not claim one tag — but re-registering the
 *     same `sourcePath` is a reload and replaces the previous entry.
 *
 * `sourcePath` is the blueprint file the block came from (absolute path on
 * the server, `/@fs/…` URL on the client). Pass it so reloads are recognised.
 */
export function registerDynamicBlock(block: LoBlock, sourcePath = ''): void {
  if (!block || typeof block !== 'object' || !block._isBlock) {
    throw new Error(
      'registerDynamicBlock: value is not a block. A block blueprint must ' +
      "default-export the result of a namespace factory (e.g. `dev({...})`)."
    );
  }

  const tag = block.name;
  const alreadyDynamic = dynamicTags.has(tag);

  if (tag in BLOCK_REGISTRY && !alreadyDynamic) {
    throw new Error(
      `Cannot load dynamic block "${tag}": a built-in block already uses ` +
      `that tag. Dynamic blocks may not shadow core blocks — rename your ` +
      `block so it has a distinct tag.`
    );
  }

  if (alreadyDynamic) {
    const previousSource = dynamicTags.get(tag);
    if (previousSource !== sourcePath) {
      throw new Error(
        `Cannot load dynamic block "${tag}": it is already provided by ` +
        `"${previousSource || 'another source'}". Two different sources ` +
        `cannot claim the same tag — rename one of them.`
      );
    }
    // Same source path → this is a reload; fall through and replace.
  }

  BLOCK_REGISTRY[tag] = block;
  dynamicTags.set(tag, sourcePath);
  registryVersion++;
  reducerRefresh();
}

/**
 * Remove a dynamically-registered block. No-op if the tag was never
 * registered dynamically; refuses to touch static blocks.
 */
export function unregisterDynamicBlock(tag: OLXTag): void {
  if (!dynamicTags.has(tag)) return;
  delete BLOCK_REGISTRY[tag];
  dynamicTags.delete(tag);
  registryVersion++;
  reducerRefresh();
}
