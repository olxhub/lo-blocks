// Resolve every block in the registry before a test renders.
//
// WHY A TEST NEEDS THIS AT ALL. `useBlocksReadyForSources` holds the render
// until every block type in the loaded content has settled, and settling means
// that block's `componentLoader()` promise resolving. Under vitest 37 of those
// promises never settle EITHER WAY -- not resolved, not rejected -- so
// `resolveBlock`'s `Promise.allSettled` never completes, `_gateSettled` is never
// set, and the gate sits at `open=false pending=37` for ever. The screen shows
// `Loading <id>...` and the test counts zero of whatever it came to count.
//
// That is what blocked `legendRender.test.ts` from 2026-09-13: the recorded
// diagnosis blamed RenderOLX's loading pipeline, having eliminated jsdom, stale
// idmaps, the dispatch shape and locale. The cause was one layer up, in the
// readiness gate, and instrumenting `useGate` showed it in a single line.
//
// So do here what a browser does for real: resolve everything up front. What
// resolves gets its component cached exactly as `resolveBlock` caches it; what
// does not within `timeoutMs` is marked `_gateSettled`, the same signal the gate
// itself honours, so a chunk that cannot load under test stops holding the whole
// screen instead of blocking it silently.
//
// NOTHING IN PRODUCTION CHANGES. A browser resolves these chunks normally; this
// exists because the test environment does not.
export async function preloadBlocks(
  registry: Record<string, any>,
  timeoutMs = 2000,
): Promise<{ loaded: number; timedOut: string[] }> {
  const timedOut: string[] = [];
  let loaded = 0;
  await Promise.all(Object.values(registry).map(async (b: any) => {
    try {
      if (b.ensureReady && !b._ensureReadyDone) {
        await Promise.race([b.ensureReady(), new Promise(r => setTimeout(r, timeoutMs))]);
        b._ensureReadyDone = true;
      }
      if (b.componentLoader && !b.component) {
        const mod: any = await Promise.race([
          b.componentLoader(),
          new Promise(r => setTimeout(() => r(null), timeoutMs)),
        ]);
        if (mod) { b.component = mod.default ?? mod; loaded++; }
        else timedOut.push(b.name);
      }
    } catch {
      // Left to the block's own error path, exactly as in production.
      timedOut.push(b.name);
    }
    b._gateSettled = true;
  }));
  return { loaded, timedOut };
}
