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

/**
 * Client ID for a document's STARTING text — a TextArea's OLX child text,
 * or a value seeded before anyone edited it.
 *
 * Reserved, and shared by every client on purpose. A starting value is not
 * something anybody typed, so attributing it to whoever happened to edit
 * first is a lie with consequences: on a shared document, two learners
 * opening the page together would each contribute the default text as
 * their own insertion and the merge would faithfully keep both copies.
 * Seeding under a fixed client at a fixed clock makes every client
 * generate byte-identical operations for the same starting text, which
 * the CRDT recognizes as one insertion it already has.
 *
 * The same ID as FOLD_CLIENT, and compatibly so: clocks 0..length-1 belong
 * to the seed, and a folding document never mints an operation at all.
 */
const SEED_CLIENT = 0;

/** Fixed so rebuilding is deterministic; nothing reads a field doc's guid. */
const FOLD_GUID = 'lo-doc';

/** Stored value → the document it encodes. */
const docs = new WeakMap<object, Doc>();

/** Stored value → its materialized text (toString walks every struct). */
const texts = new WeakMap<object, string>();

/**
 * Field instance → the document this client's last write left behind.
 *
 * The write path reads the store, and the store lags the textarea: an
 * event is enqueued (lo_event) and folded a microtask later, so two quick
 * keystrokes can both diff against the same snapshot. That snapshot is
 * text the learner has stopped looking at, and diffing against it goes
 * wrong in two ways at once — an edit that returns the text to the
 * snapshot (type a letter, delete it) produces NO operation, because
 * against the stale base nothing changed; and the next keystroke then
 * mints an operation at a clock the missing one already claimed, which
 * the CRDT rejects. The document stops tracking the textarea, the next
 * render snaps the value back, and the caret jumps backwards with it.
 *
 * So a writer builds each edit on its OWN latest document rather than on
 * whatever the store has caught up to. Keyed by field instance and not by
 * the stored value's identity, because the case that matters most is the
 * first burst of typing into an empty field, where every write sees the
 * same `undefined` and there is no object to key by.
 *
 * The store is never ignored, only combined with (see writerBase): edits
 * from anywhere else — a peer, a reconnect, an adoption — arrive through
 * it, and a writer that dropped them would keep re-sending a document
 * that disagrees with everyone else's.
 */
const heads = new Map<string, { from: unknown; head: JsonUpdate; at: number }>();

/**
 * How long a writer's head stays usable while the store still shows no
 * document at all.
 *
 * The window this covers is a microtask — an event is enqueued and folded
 * before anything else the user can do. The bound exists only so a head
 * cannot outlive that window and reappear in a later life of the same
 * field: remount the block, navigate back, let the store reset to empty,
 * and "the store has not folded my edit yet" and "this is a different
 * document now" look identical from here. Seconds separate those two
 * cases by orders of magnitude, so the exact value is not a tuning knob.
 * Once the store holds a document, the head is combined with it rather
 * than trusted alone, and this does not apply.
 */
const HEAD_TTL_MS = 2000;

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
 * The operations that put `text` into a fresh document, identically on
 * every client. See SEED_CLIENT.
 */
function seedUpdate(text: string): JsonUpdate {
  const doc = new Doc({ clientID: SEED_CLIENT, guid: FOLD_GUID });
  doc.getText(TEXT).insert(0, text);
  return doc.encodeStateAsUpdate();
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
  // Where to file the resulting document so the next write can build on
  // it. `from` is the value the caller READ — the store's, which may be
  // behind `raw` when `raw` is already a head. Recording the base instead
  // would make the next write think the store had moved.
  remember?: { key: string; from: unknown },
): JsonUpdate {
  if (clientID === SEED_CLIENT) {
    throw new RangeError(
      `client ${SEED_CLIENT} is reserved for document seeding and must not write`,
    );
  }
  const doc = new Doc({ clientID, guid: FOLD_GUID });
  const text = doc.getText(TEXT);

  // Before the listener: replaying the prior state is not part of the delta.
  if (isDocUpdate(raw)) doc.applyUpdate(raw);

  const parts: JsonUpdate[] = [];
  doc.on('update', (update: JsonUpdate) => { parts.push(update); });

  if (!isDocUpdate(raw) && typeof raw === 'string' && raw.length > 0) {
    doc.applyUpdate(seedUpdate(raw));
  }
  doc.transact(() => {
    if (splice.deleteCount > 0) text.delete(splice.index, splice.deleteCount);
    if (splice.inserted.length > 0) text.insert(splice.index, splice.inserted);
  });

  const update = parts.length === 1 ? parts[0]! : mergeUpdates(parts);
  // Where this write left off, so the next one can pick up from here
  // rather than from a store that has not folded it yet. Free: the
  // throwaway document already holds the result.
  if (remember !== undefined) {
    heads.set(remember.key, {
      from: remember.from,
      head: doc.encodeStateAsUpdate(),
      at: Date.now(),
    });
  }
  return update;
}

/**
 * The document a writer should build its next edit on: everything it has
 * written, combined with everything the store has. See `heads`.
 *
 * Combining rather than choosing is what keeps this from being a cache
 * with a staleness bug of its own. The store may hold edits this writer
 * has never seen, the writer may hold edits the store has not folded yet,
 * and after a keystroke or two it is routinely both. Combining is right in
 * every one of those cases, and idempotent when there is nothing to add.
 *
 * The exception is a store value that is NOT a document — an empty field,
 * or one blanked to '' because the learner switched to another group
 * (sync/router.ts). That is not a stale view of the writer's document, it
 * is a different document, and carrying the head across would put the old
 * group's text back on screen. So a head survives a non-document store
 * value only while the store has not moved at all since it was written,
 * which is exactly the in-flight case it exists for.
 */
export function writerBase(raw: unknown, key?: string): unknown {
  if (key === undefined) return raw;
  const entry = heads.get(key);
  if (entry === undefined || entry.head === raw) return raw;
  if (!isDocUpdate(raw)) {
    // Still in flight: the store has not moved since this head was written.
    if (raw === entry.from && Date.now() - entry.at < HEAD_TTL_MS) return entry.head;
    heads.delete(key);                            // a different document
    return raw;
  }
  return foldDocUpdate(entry.head, raw);
}

/**
 * Forget a writer's head — its next edit starts from the store alone.
 * For tests and for a field being torn down; ordinary editing never
 * needs it, since combining with the store is already correct.
 */
export function forgetWriterHead(key: string): void {
  heads.delete(key);
}
