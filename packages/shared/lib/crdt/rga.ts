/**
 * RGA (Replicated Growable Array) — a pure-JS sequence CRDT for collaborative text.
 *
 * Plain objects throughout — no WASM, no binary formats, lives natively in Redux.
 * Correctness over performance: O(n) insert/delete, no indexing tricks.
 *
 * Reference: Roh et al., "Replicated abstract data types: Building blocks for
 * collaborative applications", Journal of Parallel and Distributed Computing, 2011.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** Unique operation identifier: [actorId, sequenceNumber] */
export type OpId = [actor: string, seq: number];

/** A single character operation in the sequence */
export type Op = {
  id: OpId;
  after: OpId | null; // null = insert at document start (after ROOT)
  char: string;
  deleted: boolean;
};

/** A delete operation — first-class op with its own ID for VV tracking */
export type DeleteOp = {
  id: OpId;       // unique ID for this delete (uses the same seq counter as inserts)
  targetId: OpId; // the insert op being deleted
};

/** Version vector: maps actor → highest seq seen from that actor */
export type VersionVector = Record<string, number>;

/** The full document state — a plain JS object, Redux-serializable */
export type RgaDoc = {
  ops: Op[];
  deletes: DeleteOp[]; // all delete operations (for sync and VV tracking)
  actor: string;
  seq: number; // next sequence number for this actor
  vv: VersionVector; // version vector — tracks what we've seen from each peer
};

/** Splice parameters for applying edits */
export type SpliceParams = {
  index: number;
  deleteCount: number;
  inserted: string;
};

// ── OpId helpers ─────────────────────────────────────────────────────────────

function opIdEq(a: OpId | null, b: OpId | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Deterministic tiebreaker for concurrent inserts at the same position.
 * Returns positive if a > b (a should come first / leftward).
 * Convention: higher actor string wins, then higher seq.
 */
function compareOpId(a: OpId, b: OpId): number {
  if (a[0] !== b[0]) return a[0] > b[0] ? 1 : -1;
  return a[1] - b[1];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Find the ops-array index of the op with the given id. Returns -1 if not found. */
function findOpIndex(ops: Op[], id: OpId | null): number {
  if (id === null) return -1; // ROOT → before everything
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].id[0] === id[0] && ops[i].id[1] === id[1]) return i;
  }
  return -1;
}

/**
 * Map a visible (non-deleted) character position to the ops-array index.
 * Returns the index of the nth visible op (0-based).
 * If n equals the visible count, returns ops.length (append position).
 */
function visibleIndex(ops: Op[], n: number): number {
  let seen = 0;
  for (let i = 0; i < ops.length; i++) {
    if (seen === n) return i;
    if (!ops[i].deleted) seen++;
  }
  if (seen === n) return ops.length;
  throw new Error(`visibleIndex: position ${n} out of range (${seen} visible chars)`);
}

/**
 * Find the OpId of the nth visible character (0-based), or null for position 0
 * (meaning "after ROOT" / beginning of document).
 */
function visibleOpId(ops: Op[], n: number): OpId | null {
  if (n === 0) return ops.length > 0 ? findLastBeforeVisible(ops, 0) : null;
  let seen = 0;
  for (let i = 0; i < ops.length; i++) {
    if (!ops[i].deleted) {
      seen++;
      if (seen === n) return ops[i].id;
    }
  }
  throw new Error(`visibleOpId: position ${n} out of range (${seen} visible chars)`);
}

/**
 * For inserting at the beginning: find the "after" target.
 * Position 0 means "insert before the first visible char" → after ROOT (null).
 */
function findLastBeforeVisible(_ops: Op[], _visPos: number): OpId | null {
  return null; // Position 0 → after ROOT
}

// ── Core API ─────────────────────────────────────────────────────────────────

/** Create an empty RGA document for the given actor. */
export function rgaCreate(actor: string): RgaDoc {
  return { ops: [], deletes: [], actor, seq: 0, vv: {} };
}

/** Materialize the document text from the op log. */
export function rgaText(doc: RgaDoc): string {
  let result = "";
  for (const op of doc.ops) {
    if (!op.deleted) result += op.char;
  }
  return result;
}

/**
 * Insert a string at the given visible position.
 * Returns a new doc (immutable — does not mutate the input).
 */
export function rgaInsert(doc: RgaDoc, index: number, chars: string): RgaDoc {
  if (chars.length === 0) return doc;

  const ops = [...doc.ops];
  let seq = doc.seq;

  // Find the "after" target: the op at visible position (index - 1),
  // or null if inserting at position 0.
  let afterId: OpId | null = index === 0 ? null : visibleOpId(doc.ops, index);

  // Find where to insert in the ops array
  let insertAt: number;
  if (afterId === null) {
    // Inserting at document start — before everything, but after any
    // concurrent ops that also target ROOT (tiebreaker applies)
    insertAt = 0;
  } else {
    insertAt = findOpIndex(ops, afterId) + 1;
  }

  // Skip past any existing ops that were also inserted after the same target
  // and have higher priority (tiebreaker: higher OpId wins leftward position)
  const newOps: Op[] = [];
  for (const ch of chars) {
    const id: OpId = [doc.actor, seq++];

    // Find correct position: skip ops that come after the same target with higher
    // priority, AND all of their descendants (ops inserted after them).
    let pos = insertAt;
    const walkedPast = new Set<string>();
    while (pos < ops.length) {
      const existing = ops[pos];
      if (opIdEq(existing.after, afterId)) {
        // Same parent — sibling comparison
        if (compareOpId(id, existing.id) > 0) break; // We win, stop here
        walkedPast.add(`${existing.id[0]}:${existing.id[1]}`);
      } else if (existing.after !== null && walkedPast.has(`${existing.after[0]}:${existing.after[1]}`)) {
        // Descendant of a sibling we walked past — keep going
        walkedPast.add(`${existing.id[0]}:${existing.id[1]}`);
      } else {
        break; // Different subtree, stop
      }
      pos++;
    }

    const op: Op = { id, after: afterId, char: ch, deleted: false };
    ops.splice(pos, 0, op);
    // Next char goes after the one we just inserted
    afterId = id;
    insertAt = pos + 1;
    newOps.push(op);
  }

  const vv = { ...doc.vv, [doc.actor]: seq - 1 };
  return { ops, deletes: doc.deletes, actor: doc.actor, seq, vv };
}

/**
 * Delete `count` characters starting at the given visible position.
 * Returns a new doc (tombstones — marks ops as deleted).
 * Each deletion creates a first-class DeleteOp with its own seq number.
 */
export function rgaDelete(doc: RgaDoc, index: number, count: number): RgaDoc {
  if (count === 0) return doc;

  const ops = doc.ops.map((op) => ({ ...op })); // shallow clone each op
  const newDeletes: DeleteOp[] = [];
  let seq = doc.seq;
  let remaining = count;
  let seen = 0;

  for (let i = 0; i < ops.length && remaining > 0; i++) {
    if (!ops[i].deleted) {
      if (seen >= index) {
        ops[i].deleted = true;
        newDeletes.push({ id: [doc.actor, seq++], targetId: ops[i].id });
        remaining--;
      }
      seen++;
    }
  }

  const vv = { ...doc.vv, [doc.actor]: seq - 1 };
  return { ...doc, ops, deletes: [...doc.deletes, ...newDeletes], seq, vv };
}

/**
 * Splice: delete `deleteCount` chars at `index`, then insert `inserted` at `index`.
 * This is the main entry point for textarea edits.
 */
export function rgaSplice(doc: RgaDoc, index: number, deleteCount: number, inserted: string): RgaDoc {
  let d = doc;
  if (deleteCount > 0) d = rgaDelete(d, index, deleteCount);
  if (inserted.length > 0) d = rgaInsert(d, index, inserted);
  return d;
}

/**
 * Apply remote operations to the document (CRDT merge).
 * Each op is inserted after its `after` target, with concurrent-insert
 * ties broken by OpId comparison. Commutative and idempotent.
 */
export function rgaApplyRemoteOps(doc: RgaDoc, remoteOps: Op[]): RgaDoc {
  const ops = [...doc.ops];

  for (const remoteOp of remoteOps) {
    // Idempotent: skip if already present
    if (findOpIndex(ops, remoteOp.id) !== -1) {
      // But update deleted status (delete wins)
      if (remoteOp.deleted) {
        const idx = findOpIndex(ops, remoteOp.id);
        ops[idx] = { ...ops[idx], deleted: true };
      }
      continue;
    }

    // Find insertion point: after the "after" target
    let insertAt: number;
    if (remoteOp.after === null) {
      insertAt = 0;
    } else {
      const afterIdx = findOpIndex(ops, remoteOp.after);
      if (afterIdx === -1) {
        // Missing dependency — in a full implementation we'd buffer this.
        // For the PoC, append at end (ops will be reordered on next merge).
        insertAt = ops.length;
      } else {
        insertAt = afterIdx + 1;
      }
    }

    // Walk past concurrent ops with higher priority AND their descendants
    const walkedPast = new Set<string>();
    while (insertAt < ops.length) {
      const existing = ops[insertAt];
      if (opIdEq(existing.after, remoteOp.after)) {
        // Same parent — sibling comparison
        if (compareOpId(remoteOp.id, existing.id) > 0) break;
        walkedPast.add(`${existing.id[0]}:${existing.id[1]}`);
      } else if (existing.after !== null && walkedPast.has(`${existing.after[0]}:${existing.after[1]}`)) {
        // Descendant of a sibling we walked past
        walkedPast.add(`${existing.id[0]}:${existing.id[1]}`);
      } else {
        break;
      }
      insertAt++;
    }

    ops.splice(insertAt, 0, { ...remoteOp });
  }

  // Update version vector with the highest seq seen from each remote actor
  const vv = { ...doc.vv };
  for (const op of remoteOps) {
    const [actor, seq] = op.id;
    if (vv[actor] === undefined || seq > vv[actor]) {
      vv[actor] = seq;
    }
  }

  return { ...doc, ops, vv };
}

/**
 * Apply remote delete operations to the document.
 * Each DeleteOp marks the target insert op as deleted. Idempotent.
 */
export function rgaApplyRemoteDeletes(doc: RgaDoc, remoteDeletes: DeleteOp[]): RgaDoc {
  if (remoteDeletes.length === 0) return doc;

  const ops = [...doc.ops];
  const deletes = [...doc.deletes];

  for (const del of remoteDeletes) {
    // Idempotent: skip if we already have this delete op
    const alreadyHave = deletes.some(
      (d) => d.id[0] === del.id[0] && d.id[1] === del.id[1]
    );
    if (alreadyHave) continue;

    // Apply the delete to the target insert op
    const targetIdx = findOpIndex(ops, del.targetId);
    if (targetIdx !== -1) {
      ops[targetIdx] = { ...ops[targetIdx], deleted: true };
    }
    deletes.push({ ...del });
  }

  // Update version vector
  const vv = { ...doc.vv };
  for (const del of remoteDeletes) {
    const [actor, seq] = del.id;
    if (vv[actor] === undefined || seq > vv[actor]) {
      vv[actor] = seq;
    }
  }

  return { ...doc, ops, deletes, vv };
}

/** Return the version vector for this document. */
export function rgaVersionVector(doc: RgaDoc): VersionVector {
  return { ...doc.vv };
}

/**
 * Compute the minimum version vector across all peers.
 * A tombstone is safe to GC if all peers have seen it.
 */
export function rgaMinVersionVector(vectors: VersionVector[]): VersionVector {
  if (vectors.length === 0) return {};
  // Collect all known actors
  const allActors = new Set<string>();
  for (const vv of vectors) {
    for (const actor of Object.keys(vv)) allActors.add(actor);
  }
  // For each actor, take the minimum seq across all vectors.
  // If any vector is missing an actor, that actor's min is -1 (unseen).
  const min: VersionVector = {};
  for (const actor of allActors) {
    let m = Infinity;
    for (const vv of vectors) {
      m = Math.min(m, vv[actor] ?? -1);
    }
    if (m !== Infinity && m >= 0) min[actor] = m;
  }
  return min;
}

/**
 * Compact the document by removing tombstones and delete ops that all peers
 * have seen (according to the minimum version vector).
 *
 * A tombstoned insert op is safe to remove if the DeleteOp that deleted it
 * has been seen by all peers (its id is <= minVV for that actor).
 *
 * When a tombstone is removed, any ops whose `after` pointer referenced it
 * are rewritten to point to the tombstone's own `after` (grandparent adoption).
 */
export function rgaCompact(doc: RgaDoc, minVV: VersionVector): RgaDoc {
  // Find delete ops that all peers have seen
  const gcDeleteOps = new Set<string>();
  const gcTargets = new Set<string>();
  for (const del of doc.deletes) {
    const [actor, seq] = del.id;
    if (minVV[actor] !== undefined && seq <= minVV[actor]) {
      gcDeleteOps.add(`${del.id[0]}:${del.id[1]}`);
      gcTargets.add(`${del.targetId[0]}:${del.targetId[1]}`);
    }
  }

  if (gcTargets.size === 0) return doc;

  // Build a map from removed OpId → its `after` pointer, for grandparent adoption.
  // Chase through chains of removed ops to find the surviving ancestor.
  const redirects = new Map<string, OpId | null>();
  for (const op of doc.ops) {
    const key = `${op.id[0]}:${op.id[1]}`;
    if (gcTargets.has(key)) {
      redirects.set(key, op.after);
    }
  }

  function resolveAfter(id: OpId | null): OpId | null {
    let current = id;
    while (current !== null) {
      const key = `${current[0]}:${current[1]}`;
      if (redirects.has(key)) {
        current = redirects.get(key)!;
      } else {
        break;
      }
    }
    return current;
  }

  // Filter out removed tombstones and rewrite `after` pointers
  const ops: Op[] = [];
  for (const op of doc.ops) {
    const key = `${op.id[0]}:${op.id[1]}`;
    if (gcTargets.has(key)) continue; // GC this tombstone
    const newAfter = resolveAfter(op.after);
    if (newAfter !== op.after) {
      ops.push({ ...op, after: newAfter });
    } else {
      ops.push(op);
    }
  }

  // Remove the processed delete ops
  const deletes = doc.deletes.filter(
    (del) => !gcDeleteOps.has(`${del.id[0]}:${del.id[1]}`)
  );

  return { ...doc, ops, deletes };
}
