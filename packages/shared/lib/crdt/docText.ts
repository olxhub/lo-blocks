// packages/shared/lib/crdt/docText.ts
//
// The bridge between the sequence CRDT (./text — see its README) and the
// field system, which stores plain JSON in Redux and folds it with pure
// reducers.
//
// THE STORED VALUE IS A `JsonUpdate` — `{ version, structs, deletes }`.
// Not a live document: the CRDT's `Doc` is a mutable object graph with a
// linked list and split/merge machinery, which Redux may not hold and a
// reducer may not mutate. `JsonUpdate` is the CRDT's own serialization
// boundary, is ordinary immutable JSON, and carries everything needed to
// rebuild the document. Structs coalesce compatible runs, so a pasted
// paragraph is one struct and steady typing extends one struct rather
// than minting a record per character.
//
// THE FOLD IS `applyUpdate` — commutative, idempotent, and independent of
// arrival order. That is what makes docField's reducer safe to run on the
// client optimistically, on the server's materialization, on every peer
// relaying the same event, and again during replay: all five converge on
// the same text without coordinating. Positional splices had none of
// those properties; they only worked because there was exactly one writer.
//
// ONE TEXT PER FIELD, under the root name '' — a `Doc` can hold several
// named texts, but a field is one document. The name is stored on every
// struct, so the empty name also keeps the JSON small.
//
// Rebuilding a `Doc` from its update is O(structs), not O(characters), but
// it is not free, and both reading and folding happen per keystroke. The
// caches below make the common case — folding forward along one history —
// amortized O(1). They are WeakMaps keyed by the stored value's identity,
// so they hold nothing once Redux drops a state.

import { Doc, mergeUpdates } from './text';
import type { JsonUpdate } from './text';

/** The single text inside a field's document (see header). */
const TEXT = '';

/**
 * Client ID for documents that only ever FOLD updates — reducers and
 * reads. Such a document never mints an operation, so its ID cannot
 * collide with a writer's; `getClientId()` never issues 0, which keeps
 * that true by construction rather than by luck.
 */
const FOLD_CLIENT = 0;

/** Fixed so rebuilding is deterministic; nothing reads a field doc's guid. */
const FOLD_GUID = 'lo-doc';

/** Stored value → the document it encodes. */
const docs = new WeakMap<object, Doc>();

/** Stored value → its materialized text (toString walks every struct). */
const texts = new WeakMap<object, string>();

/** Is this raw field value a CRDT document? */
export function isDocUpdate(raw: unknown): raw is JsonUpdate {
  return (
    typeof raw === 'object' && raw !== null &&
    (raw as JsonUpdate).version === 1 &&
    Array.isArray((raw as JsonUpdate).structs) &&
    Array.isArray((raw as JsonUpdate).deletes)
  );
}

/**
 * The document for a stored value, from cache or rebuilt.
 *
 * The returned document is SHARED with the cache. Callers that mutate it
 * must evict the entry first (see `foldDocUpdate`), because after the
 * mutation it no longer encodes the value it is filed under.
 */
function liveDoc(raw: unknown): Doc {
  if (isDocUpdate(raw)) {
    const cached = docs.get(raw);
    if (cached) return cached;
  }
  const doc = new Doc({ clientID: FOLD_CLIENT, guid: FOLD_GUID });
  if (isDocUpdate(raw)) {
    doc.applyUpdate(raw);
    docs.set(raw, doc);
  }
  return doc;
}

/**
 * A raw field value as text.
 *
 * A bare string reads as itself: `switchGroup` blanks fields to '' when a
 * learner changes partition, and a field can be seeded before anyone has
 * edited it. Anything else with no document reads as empty.
 */
export function docText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (!isDocUpdate(raw)) return '';
  const cached = texts.get(raw);
  if (cached !== undefined) return cached;
  const value = liveDoc(raw).getText(TEXT).toString();
  texts.set(raw, value);
  return value;
}

/**
 * Fold one update into a stored value, yielding the next stored value.
 * This is docField's whole reducer.
 *
 * Mutates the cached document and re-files it under the result, so a
 * linear edit history costs one `applyUpdate` per event instead of a
 * rebuild. The previous value is untouched — it is immutable JSON — so a
 * later read of it (replay, a retained snapshot) simply rebuilds.
 */
export function foldDocUpdate(raw: unknown, update: JsonUpdate): JsonUpdate {
  const doc = liveDoc(raw);
  if (isDocUpdate(raw)) docs.delete(raw);
  doc.applyUpdate(update);
  const next = doc.encodeStateAsUpdate();
  docs.set(next, doc);
  return next;
}

/** Merge stored values that diverged — reconnect, adoption, seeding. */
export function mergeDocUpdates(values: readonly unknown[]): JsonUpdate {
  return mergeUpdates(values.filter(isDocUpdate));
}

/**
 * The incremental update for one splice against a stored value, as the
 * given client.
 *
 * Runs on a THROWAWAY document: this is the write path, and the reducer
 * will fold the result independently (on this client, on the server, and
 * on every peer). Sharing a document between the two would make the local
 * fold a no-op on one machine and a real merge everywhere else.
 *
 * A bare-string starting value is seeded INSIDE the captured update, so
 * the emitted operations are self-contained: a reducer folding them onto
 * an empty document reaches the same text. Nothing else can seed it —
 * the reducer never sees the string the writer diffed against.
 */
export function docSpliceUpdate(
  raw: unknown,
  splice: { index: number; deleteCount: number; inserted: string },
  clientID: number,
): JsonUpdate {
  const doc = new Doc({ clientID, guid: FOLD_GUID });
  const text = doc.getText(TEXT);

  // Before the listener: replaying the prior state is not part of the delta.
  if (isDocUpdate(raw)) doc.applyUpdate(raw);

  const parts: JsonUpdate[] = [];
  doc.on('update', (update: JsonUpdate) => { parts.push(update); });

  if (!isDocUpdate(raw) && typeof raw === 'string' && raw.length > 0) {
    text.insert(0, raw);
  }
  doc.transact(() => {
    if (splice.deleteCount > 0) text.delete(splice.index, splice.deleteCount);
    if (splice.inserted.length > 0) text.insert(splice.index, splice.inserted);
  });

  return parts.length === 1 ? parts[0]! : mergeUpdates(parts);
}
