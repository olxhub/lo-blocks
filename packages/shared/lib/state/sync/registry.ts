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
// Entries also DELIVER: broadcastEvent relays an event to the entry's
// other connections (tabs/devices converge live), and
// broadcastStatePatch sends a folded result (server-reduced fields,
// whose raw inputs are private). The pipeline decides who receives what
// (pipeline.ts, subscription-scoped).
//
// Lifecycle: acquire() on connect, entry.release() on disconnect. The
// last release flushes the persister and drops the entry; a connection
// arriving mid-flush finds the entry still in the map and reuses it (the
// refcount check after the flush notices and keeps it).

import { getMany, type KVStore } from '@/lib/storage/kvs';
import { type LevelInstance, isUserInstance } from './levels';
import { type StateConnection } from './connection';
import { kvsKey } from '@/lib/types/identity';
import { ServerState } from './materialization';
import {
  FieldPersister, CORE_SCOPES, assembleFieldState, type PersistedScope,
} from './persistence';

// The 'all' instance and its friends live in ./levels — one
// materialization per LEVEL INSTANCE (user:<id> / set:<name>:<member> /
// all), replacing the per-user registry + `_shared` pseudo-user pair.

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
  /**
   * Seed the EAGER core scopes (system/componentSetting/storage) from a
   * stored snapshot — merge (live-wins) so pre-seed folds survive — and
   * adopt their persister baseline. `component` is NOT seeded here (it is
   * lazy: ensureBucketLoaded per bucket).
   */
  seedCore(scopes: Record<string, any>): void;
  /**
   * Legacy-blob migration: adopt a WHOLE stored instance (component
   * included) and mark it all dirty so it migrates into the field store,
   * once per user. Inherently whole-instance — a legacy user's blob has no
   * per-bucket structure. Every migrated component bucket becomes resident.
   */
  seedFromBlob(scopes: Record<string, any>): void;
  /**
   * INV-1's gate: make a `component` bucket RESIDENT (its stored value
   * adopted into the materialization) before any event folds into it.
   * Single-flight per bucket; a bucket with no stored value still becomes
   * resident (resident-empty). Awaiters of the same cached promise resume
   * in registration order (same-bucket FIFO).
   */
  ensureBucketLoaded(key: string): Promise<void>;
  /**
   * Fetch-path handoff: adopt a bucket read elsewhere without a second KVS
   * read. STRICT NO-OP if already resident (a resident bucket has live
   * folds; the caller's copy is staler).
   */
  warmBucket(key: string, stored: Record<string, any> | undefined): void;
  /** Serialize the live materialization in the fetch_blob data shape, or
   * null if empty. Component is assembled from storage and overlaid with
   * resident live buckets (fetch_blob is inherently whole-instance). */
  liveState(): Promise<{ application_state: Record<string, any> } | null>;
  /**
   * Send an event to OTHER connections so they fold it with the same
   * reducer the sender used — this is how one user's tabs and devices
   * (and, for shared fields, other users) converge live
   * (docs/fields-design.md, inbound dataflow). The origin never gets its
   * own event back: it already applied it optimistically. Rides
   * lo_event's existing `browser_event` channel; the client re-dispatches
   * the detail as a `lo_server_event` CustomEvent (see store.ts).
   *
   * `to` overrides the recipient set (subscription-scoped delivery for
   * shared fields); default is the entry's own connections.
   */
  broadcastEvent(event: Record<string, any>, origin: StateConnection, to?: Iterable<StateConnection>): void;
  /**
   * Send a derived STATE patch to connections, origin included —
   * server-reduced fields (fields-design 2d): raw contribution events
   * are private, so what everyone receives (and what replaces the
   * origin's optimistic local fold) is the authoritative folded result.
   * The detail is an adoptFieldState payload; the client merges it
   * field-level, server-wins. `to` overrides the recipient set
   * (subscription-scoped delivery); default is the entry's connections.
   */
  broadcastStatePatch(bucketKey: string, bucket: Record<string, any>, to?: Iterable<StateConnection>): void;
  release(): Promise<void>;
}

/** Per-bucket residency record: the load promise (single-flight) and when
 * the bucket became resident (the eviction cold-age clock). */
interface Residency { ready: Promise<void>; at: number; }

interface InternalEntry {
  serverState: ServerState;
  persister: FieldPersister;
  refs: number;
  seedPromise: Promise<void> | null;   // CORE seed single-flight
  resident: Map<string, Residency>;    // resident `component` buckets
  sockets: Set<StateConnection>;
}

export interface RegistryOptions {
  /** Live subscriber count for a bucket at an instance — the registry
   * never imports SubscriptionRegistry, so eviction takes this callback.
   * Zero = evictable (nobody is watching). */
  subscribersOf?: (instance: LevelInstance, bucket: string) => number;
  /** Eviction sweep period (ms). */
  sweepMs?: number;
  /** A resident bucket younger than this is never evicted (ms). */
  coldMinMs?: number;
  /** Flush debounce for each entry's FieldPersister (tests). */
  debounceMs?: number;
}

export class UserStateRegistry {
  private entries = new Map<LevelInstance, InternalEntry>();
  private sweeper: ReturnType<typeof setInterval> | undefined;

  constructor(private kvs: KVStore, private options: RegistryOptions = {}) {
    // Eviction sweep (subscriptions.ts's pending-sweeper pattern): unref so
    // tests and shutdown don't hang on it.
    this.sweeper = setInterval(() => { void this.sweep(); },
      options.sweepMs ?? 60_000);
    this.sweeper.unref?.();
  }

  /** Stop the eviction sweeper (tests / shutdown). */
  stop() { if (this.sweeper) clearInterval(this.sweeper); this.sweeper = undefined; }

  acquire(user: LevelInstance, ws?: StateConnection): UserStateEntry {
    let entry = this.entries.get(user);
    if (!entry) {
      const persister = new FieldPersister(this.kvs, user, this.options.debounceMs);
      entry = {
        serverState: new ServerState(),
        persister,
        refs: 0,
        seedPromise: null,
        resident: new Map(),
        sockets: new Set(),
      };
      const created = entry;
      // INV-1 backstop: a component bucket must be resident before a fold
      // reaches it. If a reducer dirties a non-resident bucket, warn loudly
      // and repair (a reducer contract violation, not a feature).
      persister.setResidencyBackstop(
        (bucket) => created.resident.has(bucket),
        (scope, bucket) => this.repairUnexpectedDirty(user, created, scope, bucket),
      );
      this.entries.set(user, entry);
    }
    entry.refs++;
    if (ws) entry.sockets.add(ws);
    const e = entry;
    const kvs = this.kvs;
    const registry = this;

    return {
      serverState: e.serverState,
      persister: e.persister,

      ensureSeeded(load) {
        if (!e.seedPromise) e.seedPromise = load();
        return e.seedPromise;
      },

      seedCore(scopes) {
        // MERGE (seed's live-wins): core events can fold before this lands
        // (nothing enforces fetch-first). Then baseline the merged buckets
        // so the reference-diff treats them as clean until re-folded.
        e.serverState.seed(scopes);
        const st = e.serverState.state as any;
        e.persister.adoptBaseline('system', '_', st);
        for (const scope of ['componentSetting', 'storage'] as const) {
          for (const bucket of Object.keys(st[scope] ?? {})) {
            e.persister.adoptBaseline(scope, bucket, st);
          }
        }
      },

      seedFromBlob(scopes) {
        e.serverState.seed(scopes);
        e.persister.startFromUnpersisted(e.serverState.state);
        const st = e.serverState.state as any;
        for (const bucket of Object.keys(st.component ?? {})) {
          e.resident.set(bucket, { ready: Promise.resolve(), at: Date.now() });
        }
      },

      ensureBucketLoaded(key) {
        const existing = e.resident.get(key);
        if (existing) return existing.ready;
        // This record OWNS the residency slot for the duration of the load.
        // The read races eviction: a sweep may drop the bucket (and a later
        // load re-claim it) while kvs.get is in flight. Adopting regardless
        // would leave the bucket live in serverState but absent from
        // residency — resident state that reads as non-resident, which
        // spuriously refetches and trips the INV-1 backstop. So the
        // continuation adopts only while THIS record still owns the slot;
        // if it was evicted or replaced, the newer owner is authoritative.
        let record: Residency | undefined;
        const ready = (async () => {
          const raw = await kvs.get(kvsKey.field(user, 'component', key));
          const value = raw !== null ? JSON.parse(raw) : undefined;
          if (e.resident.get(key) !== record) return;
          // Adopt is a PLAIN assignment: INV-1 guarantees no fold has
          // reached this bucket yet (we gate before dispatch), so there is
          // nothing to merge.
          e.serverState.adoptBucket('component', key, value);
          e.persister.adoptBaseline('component', key, e.serverState.state);
        })();
        record = { ready, at: Date.now() };
        e.resident.set(key, record);
        return ready;
      },

      warmBucket(key, stored) {
        registry.warm(e, key, stored);
      },

      async liveState() {
        return registry.serialize(user, e);
      },

      broadcastEvent(event, origin, to) {
        const message = JSON.stringify({
          status: 'browser_event',
          event_type: 'lo_server_event',
          detail: event,
        });
        for (const sock of to ?? e.sockets) {
          if (sock === origin) continue;
          try {
            if (sock.readyState === sock.OPEN) sock.send(message);
          } catch { /* receiver gone — its release will drop it */ }
        }
      },

      broadcastStatePatch(bucketKey, bucket, to) {
        const message = JSON.stringify({
          status: 'browser_event',
          event_type: 'lo_server_state',
          detail: { sharedComponent: { [bucketKey]: bucket } },
        });
        for (const sock of to ?? e.sockets) {
          try {
            if (sock.readyState === sock.OPEN) sock.send(message);
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

  /** Is a component bucket resident in a live instance? (Tests/stats.) */
  isResident(instance: LevelInstance, bucket: string): boolean {
    return this.entries.get(instance)?.resident.has(bucket) ?? false;
  }

  /** A user's currently connected sockets — the content fetch uses this
   * to subscribe the caller's live connections to the ids it serves
   * (subscriptions.ts). Empty when the user has no open connections. */
  socketsOf(user: LevelInstance): ReadonlySet<StateConnection> {
    return this.entries.get(user)?.sockets ?? new Set();
  }

  /**
   * Read a user's whole state without acquiring — tests/debug and the
   * read side of the parallel-run comparison. Cold: assemble from storage.
   * Live: core scopes from the materialization; component assembled from
   * storage and overlaid with RESIDENT live buckets (a non-resident live
   * bucket has no folds, so storage is authoritative — INV-1).
   */
  async read(user: LevelInstance): Promise<Record<string, any> | null> {
    const live = this.entries.get(user);
    if (!live) return assembleFieldState(this.kvs, user);
    return this.serializeScopes(user, live);
  }

  /** The fetch_blob shape: read() wrapped in { application_state }, or
   * null when empty. */
  private async serialize(
    user: LevelInstance,
    e: InternalEntry,
  ): Promise<{ application_state: Record<string, any> } | null> {
    const scopes = await this.serializeScopes(user, e);
    const hasContent = CORE_SCOPES.some((s) => Object.keys(scopes[s] ?? {}).length > 0)
      || Object.keys(scopes.component ?? {}).length > 0;
    return hasContent ? { application_state: scopes } : null;
  }

  private async serializeScopes(
    user: LevelInstance,
    e: InternalEntry,
  ): Promise<Record<string, any>> {
    if (e.seedPromise) await e.seedPromise;
    const state = e.serverState.state as Record<string, any>;
    const storedComponent =
      (await assembleFieldState(this.kvs, user, ['component']))?.component ?? {};
    const component: Record<string, any> = { ...storedComponent };
    const liveComponent = state.component ?? {};
    for (const bucket of e.resident.keys()) {
      if (liveComponent[bucket] !== undefined) component[bucket] = liveComponent[bucket];
    }
    const out: Record<string, any> = { component };
    for (const scope of CORE_SCOPES) out[scope] = state[scope] ?? {};
    return out;
  }

  /**
   * Read specific COMPONENT buckets of an instance by id — the id-scoped
   * sibling of read(). Buckets are stored under plain block ids, so the
   * ids ARE the storage keys: one batched getMany, never an assembly of
   * the whole instance (which scaled with total deployment state).
   *
   * Per-bucket authority (INV-1): a RESIDENT bucket's live value wins;
   * a non-resident bucket comes straight from storage — and is warmed
   * into the entry (fetch-path handoff), so the socket's first fold skips
   * a redundant reload. Missing buckets are absent from the result.
   */
  async readBuckets(
    user: LevelInstance,
    ids: string[],
  ): Promise<Record<string, Record<string, any>>> {
    if (ids.length === 0) return {};
    const live = this.entries.get(user);
    if (!live) return this.storedBuckets(user, ids);

    const liveComponent = (live.serverState.state as Record<string, any>).component ?? {};
    const out: Record<string, Record<string, any>> = {};
    const cold: string[] = [];
    for (const id of ids) {
      if (live.resident.has(id)) {
        if (liveComponent[id] !== undefined) out[id] = liveComponent[id];
      } else {
        cold.push(id);
      }
    }
    if (cold.length > 0) {
      const stored = await this.storedBuckets(user, cold);
      // Residency RECHECKED after the await: an event's dispatch gate may
      // have made a cold bucket resident while storage was read. Once its
      // adoption has landed, the live fold is authoritative — answering
      // with our stored copy would hand the client a regressed bucket
      // (sharedComponent adoption is server-wins, so a late fetch response
      // would overwrite a newer socket patch).
      // Mid-adoption (resident claimed, nothing adopted yet) the stored
      // copy IS the gate's baseline — same bytes, safe to answer with.
      const liveNow = (live.serverState.state as Record<string, any>).component ?? {};
      for (const id of cold) {
        if (live.resident.has(id) && liveNow[id] !== undefined) {
          out[id] = liveNow[id];
        } else if (stored[id] !== undefined) {
          out[id] = stored[id];
          this.warm(live, id, stored[id]); // handoff; no-op if now resident
        }
      }
    }
    return out;
  }

  /** The stored copies of specific component buckets, one batched read. */
  private async storedBuckets(
    user: LevelInstance,
    ids: string[],
  ): Promise<Record<string, Record<string, any>>> {
    const values = await getMany(this.kvs, ids.map((id) => kvsKey.field(user, 'component', id)));
    const out: Record<string, Record<string, any>> = {};
    ids.forEach((id, i) => {
      const value = values[i];
      if (value !== null) out[id] = JSON.parse(value);
    });
    return out;
  }

  /** Adopt a bucket read elsewhere. STRICT NO-OP if resident (a resident
   * bucket has live folds; the caller's copy is staler). Safe otherwise:
   * non-resident ⇒ no folds ⇒ storage authoritative (INV-1). */
  private warm(e: InternalEntry, key: string, stored: Record<string, any> | undefined) {
    if (e.resident.has(key)) return;
    e.serverState.adoptBucket('component', key, stored);
    e.persister.adoptBaseline('component', key, e.serverState.state);
    e.resident.set(key, { ready: Promise.resolve(), at: Date.now() });
  }

  /**
   * INV-1 contract-check (loud, not a feature): a reducer dirtied a
   * component bucket that was never gated resident — it wrote a bucket
   * other than its event.id. Stop the bleeding (mark resident now) and
   * repair: merge the stored copy under the live fold (field-level, live
   * wins) and keep it dirty so the merged value flushes.
   */
  private repairUnexpectedDirty(
    instance: LevelInstance,
    e: InternalEntry,
    scope: PersistedScope,
    bucket: string,
  ) {
    console.warn(
      `[sync] INV-1 VIOLATION: reducer dirtied non-resident bucket `
      + `'${bucket}' (${scope}) at ${instance} — a reducer wrote a bucket `
      + `other than its event.id. Repairing (stored merged under live).`);
    e.resident.set(bucket, { ready: Promise.resolve(), at: Date.now() });
    void (async () => {
      const raw = await this.kvs.get(kvsKey.field(instance, scope, bucket));
      if (raw === null) return; // nothing stored — the live fold is all there is
      const stored = JSON.parse(raw);
      const live = (e.serverState.state as any)[scope]?.[bucket] ?? {};
      e.serverState.adoptBucket(scope, bucket, { ...stored, ...live });
      // Re-diff so the merged value is dirty; the bucket is resident now,
      // so this does not re-trigger the backstop.
      e.persister.stateChanged(e.serverState.state);
    })();
  }

  /**
   * Evict resident component buckets from SHARED instances (never user:
   * instances — they die with their last release). A bucket is evictable
   * only when (a) nobody subscribes it, (b) it is not dirty, and (c) it has
   * been resident longer than the cold-min age. Eviction runs THROUGH the
   * persister's serialized flush chain so it never interleaves with a
   * flush's read-modify-write.
   */
  private sweep(): Promise<void> {
    const coldMin = this.options.coldMinMs ?? 5 * 60 * 1000;
    const now = Date.now();
    const tasks: Promise<void>[] = [];
    for (const [instance, e] of this.entries) {
      if (isUserInstance(instance)) continue;
      for (const [bucket, meta] of e.resident) {
        if (now - meta.at < coldMin) continue;
        if (e.persister.isDirty('component', bucket)) continue;
        if ((this.options.subscribersOf?.(instance, bucket) ?? 0) > 0) continue;
        tasks.push(e.persister.whenIdle(() => {
          // Re-check under the serialized turn — state may have moved.
          if (e.persister.isDirty('component', bucket)) return;
          if ((this.options.subscribersOf?.(instance, bucket) ?? 0) > 0) return;
          e.serverState.dropBucket('component', bucket);
          e.persister.dropBaseline('component', bucket);
          e.resident.delete(bucket);
        }));
      }
    }
    return Promise.all(tasks).then(() => {});
  }

  /** Run one eviction sweep now and await its completion (tests). */
  sweepNow(): Promise<void> { return this.sweep(); }
}
