'use client';
// packages/shared/lib/blocks/useBlocksReady.tsx
//
// Render-side dependency gate: before rendering an idMap, await ensureReady
// for every block type appearing in it (lazy engines like mathjs — see
// lib/grading/calcLoader.ts).
//
// parseOLX awaits ensureReady per tag, so content parsed in-process is
// always covered. But content that arrives PRE-PARSED (OlxJson from
// /api/olxjson, static builds) skipped that await on this client — without
// this gate, the first when= evaluation or grader render hits
// requireCalc() cold and surfaces a retriable "engine not ready" error.
// This hook is that missing await, at render mount.
//
// Failures do not block rendering: a rejected ensureReady falls through to
// requireCalc's self-healing path (it kicks off the load and throws a
// retriable error), which is strictly better than a permanent spinner.

import { useEffect, useState } from 'react';
import type { LoBlock } from '@/lib/types';

/** Blocks in the registry whose ensureReady has not yet completed, for the
 *  tags present in idMap. Completion is cached on the block (like
 *  _resolvedComponent) so later mounts skip the gate entirely. */
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
    .filter((b): b is LoBlock => !!b?.ensureReady && !b._ensureReadyDone);
}

/** True once every block type in idMap has its dependencies ready. */
export function useBlocksReady(
  idMap: Record<string, any> | undefined,
  registry: Record<string, LoBlock>,
): boolean {
  const pending = pendingBlocks(idMap, registry);
  // Re-render trigger only — the source of truth is _ensureReadyDone.
  const [, bump] = useState(0);

  const pendingKey = pending.map(b => b.name).sort().join(',');
  useEffect(() => {
    if (!pendingKey) return;
    let alive = true;
    Promise.allSettled(
      pending.map(b =>
        b.ensureReady!()
          .then(() => { b._ensureReadyDone = true; })
          .finally(() => { b._ensureReadySettled = true; })
      ),
    ).then(() => { if (alive) bump(n => n + 1); });
    return () => { alive = false; };
    // pending is derived from idMap+registry; pendingKey captures its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  // Rejected loads don't set _ensureReadyDone, so `pending` would stay
  // non-empty and spin forever — report ready once all have settled and
  // let requireCalc's retriable path own the failure.
  return pending.every(b => b._ensureReadyDone || b._ensureReadySettled);
}
