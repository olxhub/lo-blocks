'use client';
// packages/shared/lib/blocks/useBlocksReady.tsx
//
// Render-side readiness gate: before rendering an idMap, resolve — for
// every block type appearing in it — both halves of block readiness:
//
//   ensureReady        lazy engines (mathjs — see lib/grading/calcLoader.ts)
//   componentLoader    the component's code-split chunk
//
// parseOLX awaits ensureReady per tag, so content parsed in-process is
// always covered. But content that arrives PRE-PARSED (OlxJson from
// /api/olxjson, static builds) skipped that await on this client — without
// this gate, the first when= evaluation or grader render hits
// requireCalc() cold and surfaces a retriable "engine not ready" error.
// Chunks are preloaded in the same walk so blocks paint without per-block
// spinners and chunk failures are known before render (LazyBlock remains
// the fallback for blocks that appear post-gate, and owns stale-chunk
// self-healing — see lazyBlockComponent.tsx).
//
// Failures do not block rendering: a rejected ensureReady falls through to
// requireCalc's self-healing path (it kicks off the load and throws a
// retriable error), and a rejected chunk load falls through to LazyBlock's
// error handling. Both are strictly better than a permanent spinner.

import { useEffect, useState } from 'react';
import type { LoBlock } from '@/lib/types';

/** True when a block still has readiness work: an unresolved ensureReady
 *  or an unloaded component chunk. */
function isPending(block: LoBlock): boolean {
  return (!!block.ensureReady && !block._ensureReadyDone) ||
         (!!block.componentLoader && !block.component);
}

/** Resolve one block's readiness. Completion is cached on the block (like
 *  _resolvedComponent) so later mounts skip the gate entirely. */
function resolveBlock(block: LoBlock): Promise<unknown> {
  const work: Promise<unknown>[] = [];
  if (block.ensureReady && !block._ensureReadyDone) {
    work.push(
      block.ensureReady()
        .then(() => { block._ensureReadyDone = true; })
        .finally(() => { block._ensureReadySettled = true; })
    );
  }
  if (block.componentLoader && !block.component) {
    // Same convention as LazyBlock: loaded chunks land on block.component.
    // Failures are left for LazyBlock's error path (incl. stale-chunk heal).
    work.push(
      block.componentLoader().then((loaded) => {
        if (loaded) block.component = loaded;
      })
    );
  }
  return Promise.allSettled(work);
}

/** Blocks in the registry with unresolved readiness, for the tags in idMap. */
function pendingBlocks(
  idMap: Record<string, any> | undefined,
  registry: Record<string, LoBlock>,
): LoBlock[] {
  if (!idMap) return [];
  const tags = new Set<string>();
  for (const variants of Object.values(idMap)) {
    for (const entry of Object.values(variants ?? {})) {
      const tag = (entry as { tag?: string })?.tag;
      if (tag) tags.add(tag);
    }
  }
  return [...tags]
    .map(tag => registry[tag])
    .filter((b): b is LoBlock => !!b && isPending(b));
}

/** True once every block type in idMap has its dependencies ready. */
export function useBlocksReady(
  idMap: Record<string, any> | undefined,
  registry: Record<string, LoBlock>,
): boolean {
  const pending = pendingBlocks(idMap, registry);
  // Re-render trigger only — the source of truth is the cached flags on
  // the blocks (._ensureReadyDone / .component).
  const [, bump] = useState(0);

  const pendingKey = pending.map(b => b.name).sort().join(',');
  useEffect(() => {
    if (!pendingKey) return;
    let alive = true;
    Promise.allSettled(
      // _gateSettled: this block's readiness round completed (success or
      // not) — releases the gate so failures land with their per-path
      // handlers (requireCalc's retriable error for engines; LazyBlock's
      // error path, incl. stale-chunk healing, for chunks) instead of a
      // permanent spinner.
      pending.map(b => resolveBlock(b).then(() => { b._gateSettled = true; })),
    ).then(() => { if (alive) bump(n => n + 1); });
    return () => { alive = false; };
    // pending is derived from idMap+registry; pendingKey captures its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  return pending.every(b => !isPending(b) || b._gateSettled);
}
