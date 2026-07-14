// Per-field state persistence — the parallel path to save_blob.
//
// The client's save_blob uploads its full serialized state, debounced;
// the server stores it as one opaque `blob:{user}` value. In parallel,
// the server already materializes the same state by running the shared
// reducers over the event stream (serverState.ts) — this module persists
// that materialization at bucket granularity under the `field:` keys
// reserved in kvs.ts, so a later flip can make server-materialized state
// canonical and retire the client's full-state upload entirely
// (docs/fields-design.md, build-order step 1).
//
// Granularity: one KVS value per state bucket — `field:{user}:component:{id}`,
// `field:{user}:componentSetting:{tag}`, `field:{user}:storage:{id}`, and
// the single system bucket under `field:{user}:system:_`. Buckets are what
// the reducer replaces immutably per event, so dirty detection is reference
// comparison, and each write is one block's state rather than the whole tree.
//
// The KVS has no key enumeration, so `fieldindex:{user}` holds the set of
// bucket names per scope; it is rewritten only when a new bucket first
// appears (rare after warm-up).

import { getMany, type KVStore } from '@/lib/storage/kvs';
import { kvsKey } from '@/lib/types/identity';
import type { LevelInstance } from './levels';

/** Scopes persisted per-field — must match serializeForSave in store.ts
 * (system, component, componentSetting, storage; olxjson/chat excluded). */
export const PERSISTED_SCOPES = ['system', 'component', 'componentSetting', 'storage'] as const;
type PersistedScope = (typeof PERSISTED_SCOPES)[number];

/** Bucket name for the unkeyed system scope. */
const SYSTEM_BUCKET = '_';

/** Separator inside dirty-set entries ("scope SEP bucket"). NUL cannot
 * appear in a bucket id; a space or colon could. (The escape sequence,
 * not a literal NUL byte — a literal turns this file binary and breaks
 * grep/diff, which happened 2026-07-07.) */
const SEP = '\0';

/** The reducer state's shape, as far as this module cares. */
interface AppStateLike {
  system?: Record<string, any>;
  component?: Record<string, Record<string, any>>;
  componentSetting?: Record<string, Record<string, any>>;
  storage?: Record<string, Record<string, any>>;
  [scope: string]: any;
}

type FieldIndex = Record<PersistedScope, string[]>;

const emptyIndex = (): FieldIndex =>
  ({ system: [], component: [], componentSetting: [], storage: [] });

/**
 * THE BIG PICTURE. The server keeps each user's state in memory as a
 * plain object (their "materialization" — userState.ts), updated by
 * folding every incoming event through the reducers. That in-memory
 * state dies with the process, so something has to write it to the KVS.
 * That something is this class. One instance per user.
 *
 * HOW IT KNOWS WHAT TO WRITE. It never diffs values. The reducer updates
 * state immutably — every event replaces exactly ONE bucket object (one
 * block's state) and leaves every other bucket as the same JS object.
 * So the persister just remembers the last state object it saw
 * (`lastSeen`) and compares bucket references: a bucket that is not the
 * same object as before is dirty. Dirty buckets are collected in a set.
 *
 * WHEN IT WRITES. Not per event — that would be one KVS write per
 * keystroke. A debounce timer starts when the first bucket goes dirty;
 * when writes go quiet for `debounceMs`, everything dirty flushes as one
 * batch (one KVS write per dirty bucket, plus the index when a bucket is
 * new). `close()` flushes whatever is pending when the user's last
 * connection drops.
 *
 * THE LIFECYCLE, in call order:
 *   const persister = new FieldPersister(kvs, userId);
 *   // At connect, the materialization is seeded from storage. Tell the
 *   // persister where that seed came from:
 *   persister.startFromPersisted(state);   // seed came from THIS store —
 *                                          // already on disk, write nothing
 *   persister.startFromUnpersisted(state); // seed came from the legacy
 *                                          // blob — migrate it: everything
 *                                          // is dirty, write it all
 *   // Then, after every event fold:
 *   persister.stateChanged(state);         // reference-diff, mark dirty
 *   // And when the user's last connection closes:
 *   await persister.close();               // flush the stragglers
 */
export class FieldPersister {
  private lastFlushed: AppStateLike;
  private lastSeen: AppStateLike;
  private dirty = new Set<string>(); // `${scope}${SEP}${bucket}`
  private timer: ReturnType<typeof setTimeout> | null = null;
  private index: FieldIndex | null = null; // lazy-loaded from KVS
  private pendingFlush: Promise<void> = Promise.resolve();

  constructor(
    private kvs: KVStore,
    private user: LevelInstance,
    // 1000ms matches the client's save debounce (lo_event, measured 2026-07).
    private debounceMs = 1000,
  ) {
    this.lastFlushed = {};
    this.lastSeen = {};
  }

  /** Start from a snapshot that is ALREADY in this store (the connect-time
   * seed came from here) — nothing to write. */
  startFromPersisted(state: AppStateLike) {
    this.lastFlushed = state;
    this.lastSeen = state;
  }

  /** Start from a snapshot that is NOT in this store yet (the seed came
   * from the legacy blob): everything is dirty, migrate it all — so the
   * blob fallback runs once per user, not once per session. */
  startFromUnpersisted(state: AppStateLike) {
    this.startFromPersisted(state);
    for (const scope of PERSISTED_SCOPES) {
      const bucketMap = state[scope];
      if (bucketMap === undefined) continue;
      if (scope === 'system') { this.dirty.add(`${scope}${SEP}${SYSTEM_BUCKET}`); continue; }
      for (const bucket of Object.keys(bucketMap)) this.dirty.add(`${scope}${SEP}${bucket}`);
    }
    this.scheduleFlushSoon();
  }

  /** Call after every event fold: reference-diffs the new state against
   * the last one seen and marks replaced buckets dirty. */
  stateChanged(state: AppStateLike) {
    if (state === this.lastSeen) return;
    for (const scope of PERSISTED_SCOPES) {
      const next = state[scope];
      const before = this.lastFlushed[scope];
      if (next === before || next === undefined) continue;
      if (scope === 'system') {
        this.dirty.add(`${scope}${SEP}${SYSTEM_BUCKET}`);
        continue;
      }
      for (const bucket of Object.keys(next)) {
        if (!before || before[bucket] !== next[bucket]) {
          this.dirty.add(`${scope}${SEP}${bucket}`);
        }
      }
    }
    this.lastSeen = state;
    this.scheduleFlushSoon();
  }

  /** Start the flush debounce if there is dirt and no timer running. */
  private scheduleFlushSoon() {
    if (this.dirty.size > 0 && !this.timer) {
      this.timer = setTimeout(() => { this.timer = null; this.scheduleFlush(); },
        this.debounceMs);
    }
  }

  /** Serialize flushes so index read-modify-write never interleaves. */
  private scheduleFlush() {
    this.pendingFlush = this.pendingFlush.then(() => this.flush()).catch((err) => {
      console.error(`[fieldStore] flush failed for ${this.user}:`, err);
    });
  }

  private async loadIndex(): Promise<FieldIndex> {
    if (this.index) return this.index;
    const raw = await this.kvs.get(kvsKey.fieldIndex(this.user));
    const index: FieldIndex = raw ? { ...emptyIndex(), ...JSON.parse(raw) } : emptyIndex();
    this.index = index;
    return index;
  }

  private async flush() {
    if (this.dirty.size === 0) return;
    const batch = [...this.dirty];
    this.dirty.clear();
    const state = this.lastSeen;
    this.lastFlushed = state;

    // The in-memory index mutates only AFTER its KVS write succeeds: a
    // failed index write with a mutated cache would make every later
    // flush skip the rewrite (includes() already true) while cold
    // assembleFieldState can't discover the keys (found by review
    // 2026-07). Work on a copy; commit on success.
    const index = await this.loadIndex();
    const nextIndex: FieldIndex = {
      system: [...index.system],
      component: [...index.component],
      componentSetting: [...index.componentSetting],
      storage: [...index.storage],
    };
    let indexChanged = false;

    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i];
      const [scope, bucket] = entry.split(SEP) as [PersistedScope, string];
      const value = scope === 'system' ? state.system : state[scope]?.[bucket];
      if (value === undefined) continue; // bucket vanished; nothing to write
      try {
        await this.kvs.set(kvsKey.field(this.user, scope, bucket), JSON.stringify(value));
      } catch (err) {
        // Put back the FAILED entry and every unwritten one after it —
        // clearing the dirty set up front must not turn a write failure
        // into data loss, and the throw skips the rest of the batch
        // (found by review 2026-07: only the failing bucket was re-added,
        // silently dropping its successors). The next stateChanged()/
        // close() retries them all.
        for (const remaining of batch.slice(i)) this.dirty.add(remaining);
        throw err;
      }
      if (!nextIndex[scope].includes(bucket)) {
        nextIndex[scope].push(bucket);
        indexChanged = true;
      }
    }
    if (indexChanged) {
      try {
        await this.kvs.set(kvsKey.fieldIndex(this.user), JSON.stringify(nextIndex));
      } catch (err) {
        // Bucket writes succeeded but the index doesn't know them: re-dirty
        // the batch (rewrites are idempotent) so the next flush retries the
        // index; the cached index stays uncommitted.
        for (const entry of batch) this.dirty.add(entry);
        throw err;
      }
      this.index = nextIndex;
    }
  }

  /** Cancel the debounce and write whatever is pending. */
  async close() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.scheduleFlush();
    await this.pendingFlush;
  }
}

/**
 * Reassemble a persisted state instance from the field keys — the read side
 * of the parallel path. Returns the same scope shape serializeForSave
 * persists, or null if the instance has no per-field state yet.
 */
export async function assembleFieldState(
  kvs: KVStore,
  user: LevelInstance,
): Promise<AppStateLike | null> {
  const raw = await kvs.get(kvsKey.fieldIndex(user));
  if (!raw) return null;
  const index: FieldIndex = { ...emptyIndex(), ...JSON.parse(raw) };

  // One batched read for every indexed bucket — the sequential
  // await-per-bucket loop this replaces made cold loads O(buckets)
  // round trips on network stores (found by review 2026-07).
  const entries = PERSISTED_SCOPES.flatMap((scope) =>
    index[scope].map((bucket) => ({ scope, bucket })));
  const values = await getMany(kvs, entries.map(({ scope, bucket }) =>
    kvsKey.field(user, scope, bucket)));

  const state: AppStateLike = { system: {}, component: {}, componentSetting: {}, storage: {} };
  entries.forEach(({ scope, bucket }, i) => {
    const value = values[i];
    if (value === null) return;
    if (scope === 'system') state.system = JSON.parse(value);
    else state[scope]![bucket] = JSON.parse(value);
  });
  return state;
}

/**
 * Compare the server-materialized state against a client save_blob's
 * application_state — the validation instrument for the parallel run.
 * Returns a per-scope summary of bucket agreement; deep comparison via
 * JSON of sorted-key objects so key insertion order doesn't false-alarm.
 */
export function compareToBlob(
  serverState: AppStateLike,
  blobAppState: AppStateLike | undefined,
): string {
  if (!blobAppState) return 'blob has no application_state';
  const parts: string[] = [];
  for (const scope of PERSISTED_SCOPES) {
    const server = scope === 'system'
      ? { [SYSTEM_BUCKET]: serverState[scope] ?? {} }
      : serverState[scope] ?? {};
    const blob = scope === 'system'
      ? { [SYSTEM_BUCKET]: blobAppState[scope] ?? {} }
      : blobAppState[scope] ?? {};
    const keys = new Set([...Object.keys(server), ...Object.keys(blob)]);
    let same = 0, differ = 0, serverOnly = 0, blobOnly = 0;
    for (const k of keys) {
      if (!(k in server)) { blobOnly++; continue; }
      if (!(k in blob)) { serverOnly++; continue; }
      if (stableJson(server[k]) === stableJson(blob[k])) same++; else differ++;
    }
    parts.push(`${scope}: ${same}=, ${differ}≠, ${serverOnly} server-only, ${blobOnly} blob-only`);
  }
  return parts.join('; ');
}

function stableJson(value: any): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
}
