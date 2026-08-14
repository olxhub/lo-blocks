// packages/shared/lib/crdt/docText.test.ts
//
// The field-level contract of the document CRDT: what a docField stores,
// what goes on the wire, and what every recipient must end up with.
//
// The CRDT's own correctness is tested in ./text (unit, concurrency,
// update, gc — plus the Yjs differential and fuzz suites upstream). What
// is tested HERE is the loop the field system actually runs:
//
//   write:  text the learner now sees  →  splice  →  update on the wire
//   reduce: stored value + update      →  stored value
//
// The Peer below is that loop and nothing else, so a test that passes
// here is a statement about docField, not about a test harness.

import { describe, it, expect } from 'vitest';
import { computeSplice } from './computeSplice';
import { docText, docSpliceUpdate, foldDocUpdate, mergeDocUpdates, isDocUpdate } from './docText';
import type { JsonUpdate } from './text';

/**
 * One client: a stored value, plus the two operations the field system
 * performs on it. `type` is the write path (what a keystroke produces),
 * `receive` is the reducer (what an arriving event produces) — the same
 * call the writer makes on itself optimistically.
 */
class Peer {
  raw: unknown = undefined;

  constructor(readonly clientID: number) {}

  get text(): string {
    return docText(this.raw);
  }

  /** The learner's textarea now reads `next`. Returns the wire event. */
  type(next: string): JsonUpdate {
    const update = docSpliceUpdate(this.raw, computeSplice(this.text, next), this.clientID);
    this.receive(update);
    return update;
  }

  receive(update: JsonUpdate): void {
    this.raw = foldDocUpdate(this.raw, update);
  }
}

/** Updates cross a network as JSON, so tests should too. */
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('a single writer', () => {
  it('types, appends, prepends, and inserts in the middle', () => {
    const peer = new Peer(1);

    peer.type('H');
    peer.type('He');
    peer.type('Hel');
    peer.type('Hell');
    peer.type('Hello');
    expect(peer.text).toBe('Hello');

    peer.type('Hello World');
    peer.type('Hello Beautiful World');
    expect(peer.text).toBe('Hello Beautiful World');

    peer.type('Well, Hello Beautiful World');
    expect(peer.text).toBe('Well, Hello Beautiful World');
  });

  it('deletes from the end, the middle, and the front', () => {
    const peer = new Peer(1);
    peer.type('Hello World');

    peer.type('Hello Worl');
    expect(peer.text).toBe('Hello Worl');

    peer.type('Hello');
    expect(peer.text).toBe('Hello');

    peer.type('llo');
    expect(peer.text).toBe('llo');

    peer.type('');
    expect(peer.text).toBe('');
  });

  it('survives repeated clear-and-retype', () => {
    const peer = new Peer(1);
    for (let round = 0; round < 5; round++) {
      peer.type('x');
      expect(peer.text).toBe('x');
      peer.type('');
      expect(peer.text).toBe('');
    }
    peer.type('Back');
    expect(peer.text).toBe('Back');
  });

  it('follows a long editing session', () => {
    const peer = new Peer(1);
    peer.type('The quick brown fox');
    peer.type('The quick red fox');
    peer.type('The quick red fox jumps over the lazy dog');
    peer.type('The red fox jumps over the lazy dog');
    peer.type('The red fox jumps over the sleeping dog');
    peer.type('Once upon a time, the red fox jumps over the sleeping dog');
    expect(peer.text).toBe('Once upon a time, the red fox jumps over the sleeping dog');
  });

  it('edits emoji as whole characters', () => {
    const peer = new Peer(1);
    peer.type('a😀b');
    peer.type('a🎉b');
    expect(peer.text).toBe('a🎉b');
    peer.type('ab');
    expect(peer.text).toBe('ab');
  });

  it('reports no edit when the text is unchanged', () => {
    const peer = new Peer(1);
    peer.type('steady');
    const splice = computeSplice(peer.text, 'steady');
    expect(splice.deleteCount).toBe(0);
    expect(splice.inserted).toBe('');
  });
});

describe('the stored value', () => {
  it('is plain JSON that survives a round trip', () => {
    const peer = new Peer(1);
    peer.type('hello 🌍');
    peer.type('hello, 🌍');

    expect(isDocUpdate(peer.raw)).toBe(true);
    expect(docText(wire(peer.raw))).toBe('hello, 🌍');
  });

  it('reads as itself when it is a bare string', () => {
    // switchGroup blanks fields to '' when a learner changes partition.
    expect(docText('')).toBe('');
    expect(docText('seeded')).toBe('seeded');
    expect(docText(undefined)).toBe('');
    expect(docText(null)).toBe('');
    expect(docText({ nonsense: true })).toBe('');
  });

  it('picks up a bare-string starting value on the first edit', () => {
    const peer = new Peer(1);
    peer.raw = 'seeded';

    const update = peer.type('seeded!');
    expect(peer.text).toBe('seeded!');

    // The seed rides INSIDE the update: a recipient that never saw the
    // string still reaches the same text.
    const fresh = new Peer(2);
    fresh.receive(wire(update));
    expect(fresh.text).toBe('seeded!');
  });

  it('leaves earlier values readable after later edits', () => {
    // The fold mutates a cached document and re-files it. Snapshots that
    // Redux, replay, or a test still holds must not be disturbed.
    const peer = new Peer(1);
    peer.type('one');
    const first = peer.raw;
    peer.type('one two');
    const second = peer.raw;
    peer.type('one two three');

    expect(docText(first)).toBe('one');
    expect(docText(second)).toBe('one two');
    expect(peer.text).toBe('one two three');
  });

  it('keeps a pasted run as one struct rather than one per character', () => {
    const peer = new Peer(1);
    peer.type('x'.repeat(5000));
    expect((peer.raw as JsonUpdate).structs).toHaveLength(1);

    // And typing extends that run instead of minting records.
    peer.type('x'.repeat(5000) + 'y');
    expect((peer.raw as JsonUpdate).structs).toHaveLength(1);
  });

  it('reclaims deleted payload', () => {
    const peer = new Peer(1);
    peer.type('a'.repeat(1000));
    peer.type('');

    const structs = (peer.raw as JsonUpdate).structs;
    expect(structs).toHaveLength(1);
    expect(structs[0]!.content).toBeNull();
    expect(peer.text).toBe('');
  });
});

describe('two writers', () => {
  /** Both peers see both edits; neither ordering is privileged. */
  const converge = (a: Peer, b: Peer) => {
    expect(a.text).toBe(b.text);
    return a.text;
  };

  it('keep both sets of words when editing different places', () => {
    const alice = new Peer(1);
    const bob = new Peer(2);

    const shared = alice.type('The fox jumps over the dog');
    bob.receive(wire(shared));

    const fromAlice = alice.type('The quick fox jumps over the dog');
    const fromBob = bob.type('The fox jumps over the lazy dog');

    bob.receive(wire(fromAlice));
    alice.receive(wire(fromBob));

    expect(converge(alice, bob)).toBe('The quick fox jumps over the lazy dog');
  });

  it('converge when concurrent inserts land in the same place', () => {
    const alice = new Peer(1);
    const bob = new Peer(2);

    const shared = alice.type('ab');
    bob.receive(wire(shared));

    const fromAlice = alice.type('aXb');
    const fromBob = bob.type('aYb');

    bob.receive(wire(fromAlice));
    alice.receive(wire(fromBob));

    // Which of X and Y comes first is decided by client ID, not by who
    // was heard from first — the point is that both peers agree, and
    // neither character is lost.
    const text = converge(alice, bob);
    expect(text).toMatch(/^a(XY|YX)b$/);
  });

  it('converge when one writer deletes what the other is extending', () => {
    const alice = new Peer(1);
    const bob = new Peer(2);

    const shared = alice.type('Hello World');
    bob.receive(wire(shared));

    const fromAlice = alice.type('Hello');
    const fromBob = bob.type('Hello World!');

    bob.receive(wire(fromAlice));
    alice.receive(wire(fromBob));

    expect(converge(alice, bob)).toBe('Hello!');
  });

  it('converge when both delete overlapping ranges', () => {
    const alice = new Peer(1);
    const bob = new Peer(2);

    const shared = alice.type('abcd');
    bob.receive(wire(shared));

    const fromAlice = alice.type('ad');   // drops bc
    const fromBob = bob.type('ab');       // drops cd

    bob.receive(wire(fromAlice));
    alice.receive(wire(fromBob));

    expect(converge(alice, bob)).toBe('a');
  });
});

describe('delivery is not something the fold depends on', () => {
  /** The edits three peers make, as a fixed set of wire events. */
  const history = (): JsonUpdate[] => {
    const alice = new Peer(1);
    const bob = new Peer(2);
    const carol = new Peer(3);
    const events: JsonUpdate[] = [];

    const broadcast = (from: Peer, next: string) => {
      const update = wire(from.type(next));
      events.push(update);
      for (const peer of [alice, bob, carol]) if (peer !== from) peer.receive(update);
    };

    broadcast(alice, 'Notes');
    broadcast(bob, 'Notes: ');
    broadcast(carol, 'Notes: hello');
    broadcast(alice, 'Notes: hello there');
    broadcast(bob, 'Notes: hello there!');
    return events;
  };

  const foldAll = (events: readonly JsonUpdate[]): string => {
    let raw: unknown = undefined;
    for (const update of events) raw = foldDocUpdate(raw, update);
    return docText(raw);
  };

  it('reaches the same text in order, reversed, and shuffled', () => {
    const events = history();
    const expected = foldAll(events);
    expect(expected).toBe('Notes: hello there!');

    expect(foldAll([...events].reverse())).toBe(expected);

    // Every rotation — a deterministic stand-in for arbitrary interleaving.
    for (let start = 0; start < events.length; start++) {
      const rotated = [...events.slice(start), ...events.slice(0, start)];
      expect(foldAll(rotated)).toBe(expected);
    }
  });

  it('is idempotent under redelivery', () => {
    const events = history();
    const expected = foldAll(events);

    expect(foldAll([...events, ...events])).toBe(expected);
    expect(foldAll(events.flatMap(event => [event, event, event]))).toBe(expected);
  });

  it('lets a peer that missed everything catch up from one merged update', () => {
    const events = history();
    const expected = foldAll(events);

    const latecomer = new Peer(4);
    latecomer.receive(mergeDocUpdates(events));
    expect(latecomer.text).toBe(expected);

    // …and go on editing from there.
    latecomer.type(`${expected} bye`);
    expect(latecomer.text).toBe(`${expected} bye`);
  });

  it('holds an update whose dependencies have not arrived yet', () => {
    const alice = new Peer(1);
    const first = alice.type('start');
    const second = alice.type('start and more');

    const peer = new Peer(2);
    peer.receive(wire(second));   // out of order: depends on `first`
    peer.receive(wire(first));
    expect(peer.text).toBe('start and more');
  });
});
