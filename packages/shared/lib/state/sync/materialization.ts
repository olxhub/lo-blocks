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

// Populate the field reducer registry from all registered blocks, plus the
// app-level fields with no owning block (same set the client registers via
// store.init extraFields) so their events reduce server-side too.
// Must happen once before any events are dispatched.
initReducers(BLOCK_REGISTRY, [...fieldInfosFrom(chatFields), ...fieldInfosFrom(editorFields)]);

/**
 * Per-connection server-side state. Each WebSocket connection gets its own
 * instance, mirroring the client's Redux store for that session.
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
    this.state = { ...this.state, ...persistedScopes };
  }
}
