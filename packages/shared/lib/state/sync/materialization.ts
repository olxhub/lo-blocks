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
import { chatFields } from '@/lib/state/chatFields';
import { editorFields } from '@/lib/state/editorFields';
import { fieldInfosFrom } from '@/lib/state/fields';
import { system } from '@/lib/state/settings';
import { isFlatScope } from '@/lib/state/scopes';
import { mergeDocFields } from '@/lib/crdt/merge';
import { lwwMergeBuckets } from '@/lib/crdt/lww';

// Populate the field reducer registry from all registered blocks, plus the
// app-level fields with no owning block (same set the client registers via
// store.init extraFields) so their events reduce server-side too.
// Must happen once before any events are dispatched.
// `system` (settings.ts) belongs here for the same reason the others do,
// and its absence was not cosmetic: SET_LOCALE and SET_CURRENT_USER are
// emitted by every client on every page load, so with no reducer to route
// them they fell to the reducer's plain-spread path and wrote the LWW
// envelope (`field`, `ts`, `actor`) into the system bucket as if it were
// state — on the SERVER only, which is why the two sides disagreed about
// a scope neither of them was reading closely.
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
    // arrives, and a wholesale scope replacement would erase them (found
    // by review 2026-07). Field-level within buckets.
    //
    // By TIMESTAMP, not by "live wins". Events do not merely SOMETIMES
    // arrive first: lo_event holds the snapshot request behind its flush
    // barrier (websocketLogger's askIfReady waits for barrier 'clear'),
    // so a client reconnecting with a durable outbox replays every queued
    // event — possibly a day old, which the July pilot logs show is
    // routine — BEFORE it asks for state. "Anything this materialization
    // folded is newer than the stored snapshot" is exactly false there.
    // Believing it discarded the stored (newer) answers in favour of the
    // stale replay, and `liveState()` then served that regression back to
    // the live tab: one day-old queued UPDATE_VALUE was enough to reduce
    // a filled-in board to its first row.
    //
    // Neither rule is the one a DOCUMENT asks: the stored snapshot is not
    // a stale value to be superseded, it is the edits every earlier
    // session made, and the handful this materialization folded first do
    // not replace them. Documents on both sides merge (crdt/merge.ts).
    const merged: Record<string, any> = { ...this.state };
    for (const [scope, storedScope] of Object.entries(persistedScopes)) {
      const live = (this.state as any)[scope] ?? {};
      // `system` IS its bucket — it has no id/tag-keyed map around it
      // (persistence.ts adds the synthetic `_` key only at the KVS
      // boundary). Walking each system FIELD as though it were a bucket
      // and spreading its VALUE turns strings into {0:'l',…} and numbers
      // into {} (scopes.isFlatScope).
      if (isFlatScope(scope)) {
        merged[scope] = mergeDocFields(
          lwwMergeBuckets(storedScope as Record<string, any>, live),
          storedScope as Record<string, any>,
        );
        continue;
      }
      const out: Record<string, any> = {};
      for (const key of new Set([...Object.keys(storedScope ?? {}), ...Object.keys(live)])) {
        const stored = (storedScope as any)?.[key];
        out[key] = mergeDocFields(lwwMergeBuckets(stored, live[key]), stored);
      }
      merged[scope] = out;
    }
    this.state = merged as any;
  }
}
