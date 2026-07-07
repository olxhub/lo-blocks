// Per-USER server-side state — the authority a connection folds into.
//
// Previously each connection built its own ServerState, so two tabs held
// two divergent materializations and the field store got whichever
// flushed last (bucket-level last-write-wins — the old blob race at finer
// granularity). Now the server keeps one ServerState + one FieldPersister
// per user; every connection for that user dispatches into the same
// object. Node's single thread serializes the dispatches, so every event
// lands in arrival order, and CRDT reduce makes that order irrelevant
// across devices.
//
// What this does NOT yet do: fan events back out to the user's other
// connections. Connection B's Redux converges on its next fetch, not in
// real time — that's the rebroadcast step (docs/fields-design.md step 2).
//
// Lifecycle: acquire() on connect, entry.release() on disconnect. The
// last release flushes the persister and drops the entry; a connection
// arriving mid-flush finds the entry still in the map and reuses it (the
// refcount check after the flush notices and keeps it).

import type { WebSocket } from 'ws';
import type { KVStore } from './kvs.js';
import type { SafeUserId } from '@/lib/types/identity';
import { ServerState } from './serverState.js';
import { FieldPersister, PERSISTED_SCOPES, assembleFieldState } from './fieldStore.js';

/**
 * Pseudo-user for SHARED field state (fields-design 2c): fields declared
 * `authority: 'shared'` fold into one materialization everyone reads,
 * keyed in the registry and the field store under this id instead of a
 * real user. Underscore prefix cannot collide with real safe_user_ids
 * (they are provenance-prefixed, e.g. `guest-…`). Group-scoped sharing
 * later becomes `_shared:{group}`.
 */
export const SHARED_STATE_ID = '_shared' as SafeUserId;

export interface UserStateEntry {
  serverState: ServerState;
  persister: FieldPersister;
  /**
   * Run `load` exactly once per entry (single-flight): concurrent fetches
   * from two tabs both await the same seed instead of the second clobbering
   * events that arrived after the first. `load` returns the persisted
   * scopes to seed with (or null for a brand-new user) and is responsible
   * for persister rebase/adopt.
   */
  ensureSeeded(load: () => Promise<void>): Promise<void>;
  /** Serialize the live materialization in the fetch_blob data shape,
   * or null if nothing has ever been stored or dispatched. */
  liveState(): { application_state: Record<string, any> } | null;
  /**
   * Fan an event out to the user's OTHER connections (never the origin —
   * it already applied the event optimistically). Rides lo_event's
   * existing `browser_event` channel: the client re-dispatches the
   * detail as a `lo_server_event` CustomEvent, which the store consumes
   * (see store.ts). This is inbound-dataflow step 2a
   * (docs/fields-design.md): tabs and devices of one user converge live.
   */
  fanOut(event: Record<string, any>, origin: WebSocket): void;
  release(): Promise<void>;
}

export class UserStateRegistry {
  private entries = new Map<SafeUserId, {
    serverState: ServerState;
    persister: FieldPersister;
    refs: number;
    seedPromise: Promise<void> | null;
    sockets: Set<WebSocket>;
  }>();

  constructor(private kvs: KVStore) {}

  acquire(user: SafeUserId, ws?: WebSocket): UserStateEntry {
    let entry = this.entries.get(user);
    if (!entry) {
      entry = {
        serverState: new ServerState(),
        persister: new FieldPersister(this.kvs, user),
        refs: 0,
        seedPromise: null,
        sockets: new Set(),
      };
      this.entries.set(user, entry);
    }
    entry.refs++;
    if (ws) entry.sockets.add(ws);
    const e = entry;

    return {
      serverState: e.serverState,
      persister: e.persister,

      ensureSeeded(load) {
        if (!e.seedPromise) e.seedPromise = load();
        return e.seedPromise;
      },

      liveState() {
        const state = e.serverState.state as Record<string, any>;
        const scopes: Record<string, any> = {};
        let hasContent = false;
        for (const scope of PERSISTED_SCOPES) {
          scopes[scope] = state[scope] ?? {};
          if (Object.keys(scopes[scope]).length > 0) hasContent = true;
        }
        return hasContent ? { application_state: scopes } : null;
      },

      fanOut(event, origin) {
        for (const sock of e.sockets) {
          if (sock === origin) continue;
          try {
            if (sock.readyState === sock.OPEN) {
              sock.send(JSON.stringify({
                status: 'browser_event',
                event_type: 'lo_server_event',
                detail: event,
              }));
            }
          } catch { /* receiver gone — its release will drop it */ }
        }
      },

      release: async () => {
        e.refs--;
        if (ws) e.sockets.delete(ws);
        if (e.refs > 0) return;
        await e.persister.close();
        // A connection may have arrived during the flush — keep the entry
        // (its state is still live); otherwise drop it. The flush already
        // wrote everything, so the next cold acquire reads it back intact.
        if (e.refs === 0 && this.entries.get(user) === e) {
          this.entries.delete(user);
        }
      },
    };
  }

  /** Live entry count — for tests and eventually /boot-status style stats. */
  size() { return this.entries.size; }

  /**
   * Read a user's current state without acquiring: the live
   * materialization when the user has open connections (fresher than
   * storage by up to a flush debounce), else the persisted field state.
   * Read-only — no refcounts, no seeding. Serves the content-fetch
   * initial-state path (fields-design step 2b).
   */
  async read(user: SafeUserId): Promise<Record<string, any> | null> {
    const live = this.entries.get(user);
    if (live) {
      const state = live.serverState.state as Record<string, any>;
      const scopes: Record<string, any> = {};
      for (const scope of PERSISTED_SCOPES) scopes[scope] = state[scope] ?? {};
      return scopes;
    }
    return assembleFieldState(this.kvs, user);
  }
}
