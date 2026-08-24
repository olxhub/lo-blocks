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
// Include system fields so their LWW envelopes use the same reducers on the
// server as on the client.
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
    // Merge registers by timestamp, not by "live wins": the durable outbox
    // drains before the snapshot request, so replayed events can be older
    // than stored state. Documents merge both histories (crdt/merge.ts).
    const merged: Record<string, any> = { ...this.state };
    for (const [scope, storedScope] of Object.entries(persistedScopes)) {
      const live = (this.state as any)[scope] ?? {};
      // `system` is itself a bucket; it has no id/tag-keyed map around it.
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
