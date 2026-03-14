import { describe, it, expect } from "vitest";
import {
  rgaCreate, rgaInsert, rgaDelete, rgaSplice, rgaText,
  rgaApplyRemoteOps, rgaApplyRemoteDeletes,
  rgaCompact, rgaMinVersionVector, rgaVersionVector,
  type RgaDoc, type Op, type DeleteOp,
} from "./rga";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("RGA single-user editing", () => {
  it("builds up and tears down a word character by character", () => {
    let rga = rgaCreate("alice");

    rga = rgaSplice(rga, 0, 0, "H");
    expect(rgaText(rga)).toBe("H");

    rga = rgaSplice(rga, 1, 0, "e");
    expect(rgaText(rga)).toBe("He");

    rga = rgaSplice(rga, 2, 0, "l");
    expect(rgaText(rga)).toBe("Hel");

    rga = rgaSplice(rga, 3, 0, "l");
    expect(rgaText(rga)).toBe("Hell");

    rga = rgaSplice(rga, 4, 0, "o");
    expect(rgaText(rga)).toBe("Hello");

    // Tear down
    rga = rgaSplice(rga, 4, 1, "");
    expect(rgaText(rga)).toBe("Hell");

    rga = rgaSplice(rga, 3, 1, "");
    expect(rgaText(rga)).toBe("Hel");

    rga = rgaSplice(rga, 2, 1, "");
    expect(rgaText(rga)).toBe("He");

    rga = rgaSplice(rga, 1, 1, "");
    expect(rgaText(rga)).toBe("H");

    // Change direction
    rga = rgaSplice(rga, 1, 0, "i");
    expect(rgaText(rga)).toBe("Hi");

    // Prepend
    rga = rgaSplice(rga, 0, 0, "D");
    rga = rgaSplice(rga, 1, 0, "e");
    rga = rgaSplice(rga, 2, 0, "a");
    rga = rgaSplice(rga, 3, 0, "r");
    expect(rgaText(rga)).toBe("DearHi");

    rga = rgaSplice(rga, 4, 0, " ");
    expect(rgaText(rga)).toBe("Dear Hi");
  });

  it("handles multi-character insert (paste)", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "Hello World");
    expect(rgaText(rga)).toBe("Hello World");

    rga = rgaSplice(rga, 5, 0, " Beautiful");
    expect(rgaText(rga)).toBe("Hello Beautiful World");
  });

  it("handles multi-character delete", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "Hello World");

    rga = rgaSplice(rga, 6, 5, "");
    expect(rgaText(rga)).toBe("Hello ");

    rga = rgaSplice(rga, 5, 1, "");
    expect(rgaText(rga)).toBe("Hello");
  });

  it("handles select-all replace", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "old text");
    rga = rgaSplice(rga, 0, 8, "new text");
    expect(rgaText(rga)).toBe("new text");
  });

  it("handles replace in the middle", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "Hello World");
    rga = rgaSplice(rga, 6, 5, "Earth");
    expect(rgaText(rga)).toBe("Hello Earth");
  });

  it("handles insert at beginning of non-empty doc", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "World");
    rga = rgaSplice(rga, 0, 0, "Hello ");
    expect(rgaText(rga)).toBe("Hello World");
  });

  it("handles delete from beginning", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "Hello World");
    rga = rgaSplice(rga, 0, 6, "");
    expect(rgaText(rga)).toBe("World");
  });

  it("handles delete everything", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "Hello");
    rga = rgaSplice(rga, 0, 5, "");
    expect(rgaText(rga)).toBe("");

    rga = rgaSplice(rga, 0, 0, "Back");
    expect(rgaText(rga)).toBe("Back");
  });

  it("handles repeated insert and delete at same position", () => {
    let rga = rgaCreate("alice");
    for (let i = 0; i < 10; i++) {
      rga = rgaSplice(rga, 0, 0, "x");
      expect(rgaText(rga)).toBe("x");
      rga = rgaSplice(rga, 0, 1, "");
      expect(rgaText(rga)).toBe("");
    }
  });

  it("simulates realistic editing session", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "The quick brown fox");
    rga = rgaSplice(rga, 10, 5, "red");
    expect(rgaText(rga)).toBe("The quick red fox");

    rga = rgaSplice(rga, 17, 0, " jumps over the lazy dog");
    rga = rgaSplice(rga, 4, 6, "");
    expect(rgaText(rga)).toBe("The red fox jumps over the lazy dog");

    rga = rgaSplice(rga, 27, 4, "sleeping");
    rga = rgaSplice(rga, 0, 0, "Once upon a time, ");
    rga = rgaSplice(rga, 18, 1, "t");
    expect(rgaText(rga)).toBe("Once upon a time, the red fox jumps over the sleeping dog");
  });

  it("handles single character operations throughout the document", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "a");
    rga = rgaSplice(rga, 0, 0, "b");
    rga = rgaSplice(rga, 1, 0, "c");
    rga = rgaSplice(rga, 3, 0, "d");
    rga = rgaSplice(rga, 2, 0, "e");
    expect(rgaText(rga)).toBe("bcead");

    rga = rgaSplice(rga, 2, 1, "");
    rga = rgaSplice(rga, 0, 1, "");
    rga = rgaSplice(rga, 2, 1, "");
    expect(rgaText(rga)).toBe("ca");
  });

  it("handles empty operations gracefully", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "Hi");
    rga = rgaSplice(rga, 1, 0, "");
    expect(rgaText(rga)).toBe("Hi");
  });

  it("handles long sequence of appends", () => {
    let rga = rgaCreate("alice");
    const chars = "abcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < chars.length; i++) {
      rga = rgaSplice(rga, i, 0, chars[i]);
    }
    expect(rgaText(rga)).toBe(chars);
  });

  it("handles long sequence of prepends", () => {
    let rga = rgaCreate("alice");
    const chars = "abcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < chars.length; i++) {
      rga = rgaSplice(rga, 0, 0, chars[i]);
    }
    expect(rgaText(rga)).toBe(chars.split("").reverse().join(""));
  });

  it("handles interleaved insert and delete", () => {
    let rga = rgaCreate("alice");
    rga = rgaSplice(rga, 0, 0, "ABCDE");
    rga = rgaSplice(rga, 1, 1, "X");
    expect(rgaText(rga)).toBe("AXCDE");

    rga = rgaSplice(rga, 2, 2, "YZ");
    expect(rgaText(rga)).toBe("AXYZE");

    rga = rgaSplice(rga, 0, 5, "NEW");
    expect(rgaText(rga)).toBe("NEW");
  });
});

describe("RGA internals", () => {
  it("tombstones are preserved in ops array", () => {
    let doc = rgaCreate("alice");
    doc = rgaInsert(doc, 0, "abc");
    expect(doc.ops.length).toBe(3);

    doc = rgaDelete(doc, 1, 1);
    expect(doc.ops.length).toBe(3);
    expect(doc.ops[1].deleted).toBe(true);
    expect(rgaText(doc)).toBe("ac");
  });

  it("each character gets a unique sequential OpId", () => {
    let doc = rgaCreate("alice");
    doc = rgaInsert(doc, 0, "hello");
    for (let i = 0; i < 5; i++) {
      expect(doc.ops[i].id).toEqual(["alice", i]);
    }
    expect(doc.seq).toBe(5);
  });

  it("after-pointers form a chain for sequential inserts", () => {
    let doc = rgaCreate("alice");
    doc = rgaInsert(doc, 0, "abc");
    expect(doc.ops[0].after).toBeNull();
    expect(doc.ops[1].after).toEqual(["alice", 0]);
    expect(doc.ops[2].after).toEqual(["alice", 1]);
  });

  it("insert after tombstone places correctly", () => {
    let doc = rgaCreate("alice");
    doc = rgaInsert(doc, 0, "ac");
    doc = rgaInsert(doc, 1, "b");
    expect(rgaText(doc)).toBe("abc");

    doc = rgaDelete(doc, 1, 1);
    expect(rgaText(doc)).toBe("ac");

    doc = rgaInsert(doc, 1, "B");
    expect(rgaText(doc)).toBe("aBc");
  });
});

// ── Helpers for concurrent merge tests ──────────────────────────────────────

function extractChanges(
  oldDoc: RgaDoc,
  newDoc: RgaDoc
): { inserts: Op[]; deletes: DeleteOp[] } {
  const inserts: Op[] = [];
  for (const op of newDoc.ops) {
    if (op.id[0] === newDoc.actor && op.id[1] >= oldDoc.seq) {
      inserts.push(op);
    }
  }
  const deletes: DeleteOp[] = [];
  for (const del of newDoc.deletes) {
    if (del.id[0] === newDoc.actor && del.id[1] >= oldDoc.seq) {
      deletes.push(del);
    }
  }
  return { inserts, deletes };
}

function applyChanges(
  doc: RgaDoc,
  changes: { inserts: Op[]; deletes: DeleteOp[] }
): RgaDoc {
  let d = doc;
  if (changes.inserts.length > 0) d = rgaApplyRemoteOps(d, changes.inserts);
  if (changes.deletes.length > 0) d = rgaApplyRemoteDeletes(d, changes.deletes);
  return d;
}

describe("RGA concurrent merge", () => {
  it("converges when both peers type from empty doc", () => {
    let a = rgaCreate("actor-A");
    let b = rgaCreate("actor-B");

    const a0 = a;
    a = rgaSplice(a, 0, 0, "a");
    const chA1 = extractChanges(a0, a);

    const a1 = a;
    a = rgaSplice(a, 1, 0, "b");
    const chA2 = extractChanges(a1, a);

    const b0 = b;
    b = rgaSplice(b, 0, 0, "x");
    const chB1 = extractChanges(b0, b);

    const b1 = b;
    b = rgaSplice(b, 1, 0, "y");
    const chB2 = extractChanges(b1, b);

    b = applyChanges(b, { inserts: [...chA1.inserts, ...chA2.inserts], deletes: [] });
    a = applyChanges(a, { inserts: [...chB1.inserts, ...chB2.inserts], deletes: [] });

    expect(rgaText(a)).toBe(rgaText(b));
  });

  it("converges when ops arrive one at a time (interleaved)", () => {
    let a = rgaCreate("actor-A");
    let b = rgaCreate("actor-B");

    const a0 = a;
    a = rgaSplice(a, 0, 0, "H");
    const chAH = extractChanges(a0, a);

    const a1 = a;
    a = rgaSplice(a, 1, 0, "i");
    const chAi = extractChanges(a1, a);

    const b0 = b;
    b = rgaSplice(b, 0, 0, "B");
    const chBB = extractChanges(b0, b);

    const b1 = b;
    b = rgaSplice(b, 1, 0, "y");
    const chBy = extractChanges(b1, b);

    a = applyChanges(a, chBB);
    b = applyChanges(b, chAH);
    a = applyChanges(a, chBy);
    b = applyChanges(b, chAi);

    expect(rgaText(a)).toBe(rgaText(b));
  });

  it("converges with longer concurrent sequences", () => {
    let a = rgaCreate("actor-A");
    let b = rgaCreate("actor-B");

    const changesA: { inserts: Op[]; deletes: DeleteOp[] }[] = [];
    for (const ch of "Hello") {
      const prev = a;
      a = rgaSplice(a, rgaText(a).length, 0, ch);
      changesA.push(extractChanges(prev, a));
    }

    const changesB: { inserts: Op[]; deletes: DeleteOp[] }[] = [];
    for (const ch of "World") {
      const prev = b;
      b = rgaSplice(b, rgaText(b).length, 0, ch);
      changesB.push(extractChanges(prev, b));
    }

    for (const ch of changesA) b = applyChanges(b, ch);
    for (const ch of changesB) a = applyChanges(a, ch);

    expect(rgaText(a)).toBe(rgaText(b));
  });
});

describe("RGA compact", () => {
  it("removes tombstones after sync", () => {
    let a = rgaCreate("actor-A");
    let b = rgaCreate("actor-B");

    a = rgaInsert(a, 0, "Hello");
    b = rgaApplyRemoteOps(b, a.ops.map((op) => ({ ...op })));

    const prevA = a;
    a = rgaDelete(a, 1, 3);
    b = applyChanges(b, extractChanges(prevA, a));

    expect(rgaText(a)).toBe("Ho");
    expect(rgaText(b)).toBe("Ho");
    expect(a.ops.length).toBe(5);

    const minVV = rgaMinVersionVector([rgaVersionVector(a), rgaVersionVector(b)]);
    a = rgaCompact(a, minVV);
    b = rgaCompact(b, minVV);

    expect(rgaText(a)).toBe("Ho");
    expect(a.ops.length).toBe(2);
    expect(b.ops.length).toBe(2);
  });

  it("does not remove tombstones not yet seen by all peers", () => {
    let a = rgaCreate("actor-A");
    let b = rgaCreate("actor-B");

    a = rgaInsert(a, 0, "Hello");
    b = rgaApplyRemoteOps(b, a.ops.map((op) => ({ ...op })));

    a = rgaDelete(a, 1, 3); // NOT synced to B

    const minVV = rgaMinVersionVector([rgaVersionVector(a), rgaVersionVector(b)]);
    const compactedA = rgaCompact(a, minVV);

    expect(compactedA.ops.length).toBe(5);
    expect(compactedA.ops.filter((op) => op.deleted).length).toBe(3);
  });

  it("preserves text after compacting with concurrent deletes", () => {
    let a = rgaCreate("actor-A");
    let b = rgaCreate("actor-B");

    a = rgaInsert(a, 0, "abcd");
    b = rgaApplyRemoteOps(b, a.ops.map((op) => ({ ...op })));

    const prevA = a;
    a = rgaDelete(a, 1, 2);
    const changesA = extractChanges(prevA, a);

    const prevB = b;
    b = rgaDelete(b, 2, 2);
    const changesB = extractChanges(prevB, b);

    a = applyChanges(a, changesB);
    b = applyChanges(b, changesA);

    expect(rgaText(a)).toBe("a");
    expect(rgaText(b)).toBe("a");

    const minVV = rgaMinVersionVector([rgaVersionVector(a), rgaVersionVector(b)]);
    a = rgaCompact(a, minVV);
    b = rgaCompact(b, minVV);

    expect(rgaText(a)).toBe("a");
    expect(a.ops.length).toBe(1);
    expect(b.ops.length).toBe(1);
  });

  it("rewrites after-pointers when removing tombstones", () => {
    let doc = rgaCreate("alice");
    doc = rgaInsert(doc, 0, "abc");
    doc = rgaDelete(doc, 1, 1);

    const minVV = { alice: doc.seq - 1 };
    doc = rgaCompact(doc, minVV);

    expect(rgaText(doc)).toBe("ac");
    expect(doc.ops.length).toBe(2);
    expect(doc.ops[1].after).toEqual(["alice", 0]);
  });

  it("editing continues to work after compaction", () => {
    let a = rgaCreate("actor-A");
    let b = rgaCreate("actor-B");

    a = rgaInsert(a, 0, "Hello World");
    b = rgaApplyRemoteOps(b, a.ops.map((op) => ({ ...op })));

    const prevA = a;
    a = rgaDelete(a, 5, 6);
    b = applyChanges(b, extractChanges(prevA, a));

    const minVV = rgaMinVersionVector([rgaVersionVector(a), rgaVersionVector(b)]);
    a = rgaCompact(a, minVV);
    b = rgaCompact(b, minVV);

    expect(rgaText(a)).toBe("Hello");

    const prevA2 = a;
    a = rgaSplice(a, 5, 0, " Earth");
    b = applyChanges(b, extractChanges(prevA2, a));

    expect(rgaText(a)).toBe("Hello Earth");
    expect(rgaText(b)).toBe("Hello Earth");
  });

  it("deletes have their own seq numbers for VV tracking", () => {
    let doc = rgaCreate("alice");
    doc = rgaInsert(doc, 0, "abc");
    expect(doc.seq).toBe(3);

    doc = rgaDelete(doc, 1, 1);
    expect(doc.seq).toBe(4);
    expect(doc.deletes.length).toBe(1);
    expect(doc.deletes[0].id).toEqual(["alice", 3]);
    expect(doc.deletes[0].targetId).toEqual(["alice", 1]);
    expect(doc.vv["alice"]).toBe(3);
  });
});
