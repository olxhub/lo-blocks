// Server-side state manager.
//
// Wraps updateResponseReducer so the server can track client state by
// replaying the same events that drive the client's Redux store. No Redux
// library needed — just the pure reducer function applied directly.
//
// The same reducer runs client-side and server-side, so the state shapes
// match exactly. This is the foundation for server-authoritative state,
// blob validation, replay, and analytics.

import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { updateResponseReducer, initReducers } from '@/lib/state/store';
import { system } from '@/lib/state/settings';
import { chatFields } from '@/lib/state/chatFields';
import { editorFields } from '@/lib/state/editorFields';
import { fieldInfosFrom } from '@/lib/state/fields';

// Populate the field reducer registry from all registered blocks, plus the
// app-level fields with no owning block (same set the client registers via
// store.init extraFields) so their events reduce server-side too.
// Must happen once before any events are dispatched.
//
// `system` belongs in that set and was missing. Without its field reducers a
// system event (SET_LOCALE, SET_CURRENT_USER) fell through to the classic
// spread, which writes the event ENVELOPE into the bucket as if it were state
// — `field`, `ts` and `actor` became sibling "fields" of `locale` — and the
// value lost the `locale.ts`/`locale.actor` stamps the client gives it. So the
// server's materialization did not match the client's for the one scope both
// of them write, which is precisely what compareToBlob exists to detect.
initReducers(BLOCK_REGISTRY, [
  ...fieldInfosFrom(system),
  ...fieldInfosFrom(chatFields),
  ...fieldInfosFrom(editorFields),
]);

/**
 * One materialization per LEVEL INSTANCE (user:…, set:…, all — see
 * levels.ts), held in the registry and shared by every connection that
 * folds into or reads that instance. Mirrors the client's Redux store
 * shape.
 */
export class ServerState {
  state: ReturnType<typeof updateResponseReducer>;

  constructor() {
    this.state = updateResponseReducer(undefined, { event: '@@INIT' });
  }

  /** Apply an event — same shape as what arrives over the WebSocket. */
  dispatch(event: Record<string, any>) {
    this.state = updateResponseReducer(this.state, event);
  }

  /**
   * Adopt previously persisted scopes (from the user's stored blob or the
   * per-field store). The client does the same on load (deserializeOnLoad
   * in store.ts) — without this, a connection's materialized state covers
   * only this session's events and can never match the client's.
   */
  seed(persistedScopes: Record<string, any> | null | undefined) {
    if (!persistedScopes) return;
    // MERGE, don't replace: events can fold before the connect-time seed
    // arrives (the client usually fetches first, but nothing enforces
    // it), and a wholesale scope replacement would erase them (found by
    // review 2026-07). Field-level within buckets, LIVE values winning —
    // anything this materialization already folded is strictly newer
    // than the stored snapshot.
    const merged: Record<string, any> = { ...this.state };
    for (const [scope, storedBuckets] of Object.entries(persistedScopes)) {
      const live = (this.state as any)[scope] ?? {};

      // `system` is ONE bucket, not a map of them: its keys are field names
      // and its values are field VALUES. Merging it key-by-key like the
      // keyed scopes spreads each value as though it were a bucket object,
      // which quietly destroys every non-object field — a string becomes a
      // map of its characters ({"0":"l","1":"o",…} for "locale") and a number
      // becomes {}. It survived review because the corruption is invisible
      // where it happens: the reducer writes the bucket correctly, and only a
      // RESEED — reconnect, second tab, server restart — rewrites it mangled.
      // The client's deserializeOnLoad has always drawn this distinction
      // (store.ts: `system` merges flat, mergeBuckets handles the rest); this
      // is the server catching up, and the shapes have to agree or
      // compareToBlob's whole premise is void.
      if (scope === 'system') {
        merged[scope] = { ...(storedBuckets as any), ...live };
        continue;
      }

      const out: Record<string, any> = {};
      for (const key of new Set([...Object.keys(storedBuckets ?? {}), ...Object.keys(live)])) {
        out[key] = { ...(storedBuckets as any)?.[key], ...live[key] };
      }
      merged[scope] = out;
    }
    this.state = merged as any;
  }
}
