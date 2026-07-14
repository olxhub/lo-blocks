// packages/shared/lib/content/generation.ts
//
// The content GENERATION signal: one monotonically increasing integer bumped
// whenever a content sync actually changed the in-memory snapshot (added,
// changed, or deleted files — see syncContentFromStorage). "Did content
// change?" collapses to an integer compare against a value read once and
// cached, so anything derived from content (routing indexes, the /api/olxjson
// ETag) can invalidate lazily instead of re-scanning the tree.
//
// The getter is SYNCHRONOUS on purpose: the state-sync hot path
// (partitions/fieldLevels, run per websocket event) must decide "still fresh?"
// with a plain integer read, never an await. The async token check that DRIVES
// a bump lives in the sync/request paths that already await (syncContentFromStorage).

let _generation = 0;

type GenerationListener = (generation: number) => void;
const _listeners = new Set<GenerationListener>();

/** The current content generation. Cheap, synchronous — safe on hot paths. */
export function contentGeneration(): number {
  return _generation;
}

/** Bump the generation and notify subscribers. Called by syncContentFromStorage
 *  on a snapshot rebuild that changed content. Returns the new value. */
export function bumpContentGeneration(): number {
  _generation++;
  for (const fn of _listeners) {
    try {
      fn(_generation);
    } catch (err) {
      console.error('[contentGeneration] listener threw:', err);
    }
  }
  return _generation;
}

/** Subscribe to generation bumps. Returns an unsubscribe function. */
export function onGeneration(fn: GenerationListener): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

/**
 * Memoize an async build over content, invalidated by the generation signal.
 *
 * The build re-runs on the first call AFTER the generation changed; between
 * changes every call returns the cached value behind a single synchronous
 * integer compare — no content scan, no await of the build. Concurrent calls
 * during a rebuild share one in-flight build (single-flight). This is the one
 * helper that replaced the per-module ~2s TTL re-scan caches in
 * partitions/aggregations/fieldLevels.
 */
export function generationMemo<T>(build: () => Promise<T>): () => Promise<T> {
  let built = false;
  let value: T;
  let builtGen = -1;
  let inflight: Promise<T> | null = null;

  return () => {
    const gen = contentGeneration();
    if (built && gen === builtGen) return Promise.resolve(value);
    if (inflight) return inflight;
    inflight = build().then(
      (result) => {
        value = result;
        built = true;
        builtGen = gen;
        inflight = null;
        return result;
      },
      (err) => {
        inflight = null;
        throw err;
      },
    );
    return inflight;
  };
}
