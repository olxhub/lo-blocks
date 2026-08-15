// packages/shared/lib/crdt/merge.ts
//
// Reconciling two copies of the same state that were written apart.
//
// This is not the live path. Live edits reconcile by folding events —
// every peer, the server's materialization, and the writer itself run
// the same reducer over the same updates and converge (see
// fieldTypes/crdt/doc.ts). What needs help here is the moment two copies
// meet having NOT seen each other's events at all:
//
//   ADOPT_FIELD_STATE  stored state rides in on a content fetch, and this
//                      session may already have typed into the same bucket
//   ServerState.seed   a materialization is seeded from the KVS after it
//                      has already folded events
//
// Both resolve by PICKING A SIDE — locally-present wins, live wins. For a
// register that is the whole answer: one of the two values is the one the
// learner meant. For a DOCUMENT it is the wrong question. Two copies of a
// document are two sets of edits, and dropping one drops paragraphs that
// nothing in the conflict rule wanted dropped — an essay written in an
// earlier session, or the sentence typed in the moment between opening the
// page and the fetch landing. A document merges, so it should be merged.
//
// Only documents are merged here. Sets and logs are mergeable in principle
// too, but their call sites resolve at a granularity that is deliberate
// and out of scope to change; widening this is a separate decision, and
// the shape of the helper below leaves room for it.

import { isDocValue, tryFoldDocUpdate } from './docText';

/**
 * Reconcile two copies of one state bucket.
 *
 * `preferred` wins wholesale — the caller's policy is preserved exactly —
 * EXCEPT for fields where both copies hold a document, which are merged.
 * Merging normalizes through a document rather than concatenating the two
 * updates, so repeated reconciliation cannot accumulate redundant structs.
 *
 * A document that cannot merge falls back to the caller's policy too:
 * `preferred` is kept and a warning is logged. This runs inside a Redux
 * reducer (ADOPT_FIELD_STATE) and inside connection setup
 * (ServerState.seed), where an exception would take down a whole state
 * update or a handshake rather than one field.
 *
 * Returns `preferred` itself when nothing merged, so callers can keep
 * their same-object-when-unchanged guarantees.
 */
export function mergeDocFields<T extends Record<string, any>>(
  preferred: T | undefined,
  other: Record<string, any> | undefined,
  // What to do with a document that cannot merge at all. Keeping the
  // preferred copy is right wherever the preferred copy is the one that
  // will survive anyway — a server-authoritative bucket, a server's own
  // materialization.
  //
  // 'take-other' is for the one place that is not true: a CLIENT
  // reconciling its own bucket against stored state. There, a local
  // document that cannot merge with the stored one is dead — it can never
  // persist and never sync, because every write built on it will be
  // refused for as long as the learner keeps that browser. Adopting the
  // stored copy costs whatever was typed in the racing window that created
  // the split (seconds, before the connect-time load landed) and buys back
  // a device that works. Keeping the local copy costs everything typed on
  // that device from then on, silently.
  onUnmergeable: 'keep-preferred' | 'take-other' = 'keep-preferred',
): T | undefined {
  if (!preferred || !other) return preferred;
  let result: T | undefined;
  for (const [field, theirs] of Object.entries(other)) {
    const mine = preferred[field];
    if (!isDocValue(mine) || !isDocValue(theirs)) continue;
    const merged = tryFoldDocUpdate(mine, theirs, `reconciling '${field}'`);
    if (merged === null && onUnmergeable === 'keep-preferred') continue;
    result ??= { ...preferred };
    (result as Record<string, any>)[field] = merged ?? theirs;
  }
  return result ?? preferred;
}

/** Does either copy of this bucket hold a document the other also has? */
export function hasMergeableDoc(
  preferred: Record<string, any> | undefined,
  other: Record<string, any> | undefined,
): boolean {
  if (!preferred || !other) return false;
  return Object.entries(other).some(
    ([field, theirs]) => isDocValue(theirs) && isDocValue(preferred[field]),
  );
}
