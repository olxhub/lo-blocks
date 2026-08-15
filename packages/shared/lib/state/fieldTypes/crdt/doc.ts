// packages/shared/lib/state/fieldTypes/crdt/doc.ts
//
// Document field — collaborative text, backed by the sequence CRDT in
// lib/crdt/text (see its README) through lib/crdt/docText.ts.
//
// A docField is a DOCUMENT, not a register. The distinction is the whole
// point: a stateField's value is replaced by whoever wrote last, which
// for prose means one editor's paragraph silently erasing another's. A
// document records the EDITS, so two people typing in different places
// keep both sets of words, and typing in the same place interleaves
// deterministically rather than picking a winner.
//
// Behavior summary:
//   - stores:   a JsonUpdate (plain JSON — see crdt/docText.ts)
//   - read:     the document's text
//   - write:    diffs old text → new text, replays that splice on a
//               throwaway document, and emits the resulting update
//   - reduce:   applyUpdate — commutative, idempotent, order-independent
//   - display:  same as read (both produce a string)
//   - equality: referential (every fold produces a new object)
//   - events:   SPLICE_INPUT, carrying { field, update }
//
// WHY THE EVENT CARRIES AN UPDATE rather than (index, deleteCount,
// inserted): positions are only meaningful against the exact text the
// writer was looking at. Two learners editing one document produce
// positions in two different coordinate systems, and folding one
// against the other's text lands the words in the wrong place — the
// failure is silent and the documents never reconverge. An update names
// the neighbouring CHARACTERS instead of counting from the start, so
// every recipient reaches the same document no matter what order the
// events arrive in, how often they are redelivered, or which of them
// the recipient had already seen. That property is what lets the same
// reducer run on the writer optimistically, on the server's
// materialization, on every subscribed peer, and again during replay.
//
// The writer's throwaway document (docSpliceUpdate) is deliberate: the
// write path must not fold, or the local fold would be a no-op here and
// a real merge everywhere else.
//
// KNOWN GAPS live with the representation, in crdt/docText.ts: document
// epochs (which subsume seed identity, tombstone sunsetting, and cursor
// anchor validity), the per-keystroke re-encode cost, and the
// asynchronous local fold that `heads` works around. Cursor gaps are in
// state/bindings/useInputField.ts. Read both before extending this.
//
import { scopes } from '../../scopes';
import {
  docText, docSpliceUpdate, foldDocUpdate, isDocUpdate, writerBase,
} from '../../../crdt/docText';
import { computeSplice } from '../../../crdt/computeSplice';
import { getClientId } from '../../../crdt/actorId';
import type { FieldInfo, FieldName, FieldEvent, WriteResult } from '../../../types';

/**
 * CRDT document field — stores a JsonUpdate in Redux, materializes to string.
 */
export function docField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  return {
    // Caller opts pass through WHOLESALE (see classic/state.ts — allow-
    // lists silently drop options; this constructor also ignored
    // opts.scope entirely). Constructor-owned keys follow, opts-aware.
    ...opts,
    type: 'field',
    kind: 'doc',
    name: name as FieldName,
    events: opts?.events ?? ['SPLICE_INPUT' as FieldEvent],
    event: opts?.event ?? 'SPLICE_INPUT',
    scope: opts?.scope ?? scopes.component,
    read: opts?.read ?? docText,
    display: opts?.display ?? docText,
    write: opts?.write ?? ((oldRaw: any, newValue: any, context?: { key?: string }): WriteResult[] => {
      // Build on this writer's own latest document combined with the
      // store's, not on the store's alone. The store lags by a microtask
      // (lo_event enqueues), and a keystroke diffed against text the
      // learner has already moved past drops the edit silently and then
      // collides with the next one — see `heads` in crdt/docText.ts.
      const base = writerBase(oldRaw, context?.key);
      const splice = computeSplice(docText(base), String(newValue ?? ''));
      if (splice.deleteCount === 0 && splice.inserted.length === 0) return [];
      const remember = context?.key === undefined
        ? undefined
        : { key: context.key, from: oldRaw };
      return [{
        event: 'SPLICE_INPUT' as FieldEvent,
        payload: {
          field: name,
          update: docSpliceUpdate(base, splice, getClientId(), remember),
        },
      }];
    }),
    // Doc reduce owns ONLY the doc — sibling data (the cursor's `selection`
    // field) rides the event's extras envelope and is folded by store.ts.
    reduce: opts?.reduce ?? ((componentState: Record<string, any>, action: any, fieldName: string) => {
      // A malformed or absent update is not an edit. Folding it would
      // replace the document with an empty one; ignoring it leaves the
      // learner's text alone, which is the safe direction for a reducer
      // that also runs on whatever arrives over the wire.
      if (!isDocUpdate(action.update)) return {};
      try {
        return { [fieldName]: foldDocUpdate(componentState[fieldName], action.update) };
      } catch (error) {
        // This reducer is where wire data becomes state, and it runs on
        // every peer and on the server's materialization. An update the
        // CRDT rejects — the serious case being two writers that claim one
        // client ID, which addresses different characters identically and
        // cannot be merged — must not become an exception thrown out of a
        // Redux reducer, because that takes down every LATER event too and
        // turns one bad packet into a dead page. Drop the event, keep the
        // document, and say so: a rejection here means a bug in identity
        // (crdt/actorId.ts) or a peer sending updates it did not generate.
        console.warn(`[docField] '${name}': rejected update —`, error);
        return {};
      }
    }),
    equality: opts?.equality ?? Object.is,
  };
}
