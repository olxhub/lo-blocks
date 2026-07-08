// packages/shared/lib/crdt/log.ts
//
// Append-only log CRDT — an ordered sequence of arbitrary (JSON-serializable)
// items that only grows. Built for message transcripts: chat is multi-producer
// by design (a user, an LLM agent, eventually other users and a script
// player), and a grow-only op-keyed log merges trivially — union by opId,
// sort by (ts, actor, n). No positional pointers (RGA) needed because items
// are only ever appended, never inserted mid-sequence.
//
// Storage format (raw Redux value — a LogDoc):
//   { entries: { 'actor1:170...:1': { ts, actor, n, item }, ... },
//     clearedAt?: { ts, actor } }
//
// Consumer-facing value (via logRead): item[] in (ts, actor, n) order.
//
// Clearing is a LWW watermark, not entry deletion: entries at or before
// clearedAt.ts are hidden on read. A concurrent append from another actor
// after the clear survives — which is the right semantics for "clear my
// chat" racing "a message arrives."
//
// Relationship to other CRDTs in this directory:
//   - lww.ts: register CRDT for single values (used by stateField)
//   - rga.ts: sequence CRDT for collaborative text (used by docField)
//   - set.ts: LWW-element set (used by setField)
//   - log.ts: append-only ordered log (used by logField)
//   All are plain JS objects, Redux-serializable.
//
import { getActorId } from './actorId';
import type { FieldEvent, WriteResult } from '../types';

// ---------------------------------------------------------------------------
// Storage types
// ---------------------------------------------------------------------------

/** One appended item with its provenance stamp. */
export interface LogEntry {
  ts: number;
  actor: string;
  /** Per-session append counter — disambiguates same-ms appends by one actor. */
  n: number;
  item: unknown;
}

/** Raw Redux storage. Entries are keyed by opId (`actor:ts:n`). */
export interface LogDoc {
  entries: Record<string, LogEntry>;
  /** LWW clear watermark — entries with ts <= clearedAt.ts are hidden. */
  clearedAt?: { ts: number; actor: string };
}

// ---------------------------------------------------------------------------
// Op identity
// ---------------------------------------------------------------------------

/** Session-scoped append counter. Actor ids are per-session (actorId.ts),
 *  so `actor:ts:n` is globally unique without cross-session coordination. */
let _appendCounter = 0;

/** Stamp for a new append: opId + the entry metadata it encodes. */
export function newLogStamp(ts = Date.now(), actor = getActorId()): {
  opId: string; ts: number; actor: string; n: number;
} {
  const n = ++_appendCounter;
  return { opId: `${actor}:${ts}:${n}`, ts, actor, n };
}

// ---------------------------------------------------------------------------
// CRDT operations
// ---------------------------------------------------------------------------

/** Total order: timestamp, then actor (stable across replicas), then counter. */
function entryCompare(a: LogEntry, b: LogEntry): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.actor !== b.actor) return a.actor < b.actor ? -1 : 1;
  return a.n - b.n;
}

const EMPTY_LOG: unknown[] = [];

// Materialization cache: same raw doc → same array identity, so React
// selectors comparing by Object.is don't re-render on every read.
const _readCache = new WeakMap<object, unknown[]>();

/** Materialize a LogDoc to the consumer-facing ordered item array. */
export function logRead(raw: any): unknown[] {
  if (!raw || typeof raw !== 'object') return EMPTY_LOG;
  if (Array.isArray(raw)) return raw;  // already materialized (idempotent)
  const cached = _readCache.get(raw);
  if (cached) return cached;

  const doc = raw as LogDoc;
  const cleared = doc.clearedAt;
  const entries = Object.values(doc.entries ?? {})
    .filter((e): e is LogEntry => !!e && typeof e === 'object')
    .filter(e => !cleared || e.ts > cleared.ts);
  entries.sort(entryCompare);
  const items = entries.map(e => e.item);
  _readCache.set(raw, items);
  return items;
}

/** Human/LLM-readable display: entry count. */
export function logDisplay(raw: any): string {
  const items = logRead(raw);
  return `${items.length} entr${items.length === 1 ? 'y' : 'ies'}`;
}

/**
 * Whole-value write, for the useFieldState-setter pattern:
 * `setMessages([...messages, newMessage])`. APPEND-ONLY — items beyond the
 * current materialized length are appended; the existing prefix is assumed
 * unchanged (a log has no item identity to diff by). To empty the log,
 * dispatch LOG_CLEAR (see clearLog) — a shorter array here is an error.
 */
export function logWrite(fieldName: string) {
  return (oldRaw: any, newValue: any): WriteResult[] => {
    const current = logRead(oldRaw);
    const items: unknown[] = Array.isArray(newValue) ? newValue : [newValue];
    if (items.length < current.length) {
      throw new Error(
        `[logWrite] '${fieldName}' is append-only (got ${items.length} items, have ${current.length}). ` +
        `Use LOG_CLEAR to empty it.`
      );
    }
    return items.slice(current.length).map((item) => {
      const stamp = newLogStamp();
      return {
        event: 'LOG_APPEND' as FieldEvent,
        payload: { field: fieldName, item, ...stamp },
      };
    });
  };
}

/**
 * Apply a LOG_APPEND or LOG_CLEAR event to the LogDoc.
 * Append is idempotent by opId; clear is LWW on the watermark.
 */
export function logReduce(
  componentState: Record<string, any>,
  action: any,
  fieldName: string,
): Record<string, any> {
  const type = action.type || action.event;
  const raw = componentState[fieldName] as LogDoc | undefined;

  if (type === 'LOG_APPEND') {
    const { opId, item, ts = Date.now(), actor = getActorId(), n = 0 } = action;
    if (!opId) return {};
    if (raw?.entries?.[opId]) return {};  // duplicate delivery — idempotent
    return {
      [fieldName]: {
        ...raw,
        entries: { ...raw?.entries, [opId]: { ts, actor, n, item } },
      },
    };
  }

  if (type === 'LOG_CLEAR') {
    const { ts = Date.now(), actor = getActorId() } = action;
    const existing = raw?.clearedAt;
    // LWW: newer watermark wins; on tie, higher actor.
    if (existing && (existing.ts > ts || (existing.ts === ts && existing.actor > actor))) return {};
    return {
      [fieldName]: { entries: {}, ...raw, clearedAt: { ts, actor } },
    };
  }

  return {};
}
