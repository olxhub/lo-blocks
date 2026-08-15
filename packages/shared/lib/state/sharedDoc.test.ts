// @vitest-environment node
// packages/shared/lib/state/sharedDoc.test.ts
//
// A shared docField, through the real reducer.
//
// This is the claim the level guard used to deny: several people editing
// one document at once, each folding their own edit optimistically and
// the others' as they arrive, all reaching the same text. Nothing in the
// sync engine had to learn about documents for this to work — router.ts
// relays a level-everyone event to the instance's subscribers and folds
// it into the server's materialization with the SAME reducer run here,
// and an update fold is commutative and idempotent. What is tested is
// that the reducer really does have those properties in situ, with the
// event envelope, bucket routing, and adoption rules around it.

import { describe, it, expect, beforeEach } from 'vitest';
import { initReducers, updateResponseReducer, ADOPT_FIELD_STATE } from './store';
import { fieldInfosFrom } from './fields';
import { docField } from './fieldTypes/crdt/doc';
import { computeSplice } from '../crdt/computeSplice';
import { docText, docSpliceUpdate, foldDocUpdate } from '../crdt/docText';

const NOTES = docField('notes', { level: 'everyone' });
const BLOCK = 'demos/notes';

/**
 * One participant: their Redux state, and their identity in the CRDT.
 *
 * `clientID` undefined means "this session" — the client types through
 * docField.write, which identifies the writer with getClientId(). That is
 * a per-realm singleton: one tab is one writer, which is exactly right in
 * a browser and exactly wrong for simulating a second person inside one
 * test process. Every other participant therefore names its client ID,
 * and the update it produces is byte-identical to what that person's
 * browser would have sent.
 */
class Client {
  state: any = updateResponseReducer(undefined, { event: '@@INIT' });

  constructor(readonly clientID?: number) {}

  get raw(): unknown {
    return this.state.component?.[BLOCK]?.notes;
  }

  get text(): string {
    return docText(this.raw);
  }

  /**
   * The learner's textarea now reads `next`. Produces the event that goes
   * on the wire, and folds it locally — exactly what updateField does
   * (field.write, then dispatch, which the local store also reduces).
   */
  type(next: string): Record<string, any> {
    let payload: Record<string, any>;
    if (this.clientID === undefined) {
      const results = NOTES.write!(this.raw as any, next);
      expect(results).toHaveLength(1);
      payload = results[0]!.payload;
    } else {
      payload = {
        field: 'notes',
        update: docSpliceUpdate(this.raw, computeSplice(this.text, next), this.clientID),
      };
    }
    const event = {
      event: 'SPLICE_INPUT',
      scope: 'component',
      id: BLOCK,
      authority: 'shared',
      ...payload,
    };
    this.receive(event);
    return JSON.parse(JSON.stringify(event));
  }

  /** An event arriving from the server relay — or from anywhere. */
  receive(event: Record<string, any>): void {
    this.state = updateResponseReducer(this.state, event);
  }

  /** Stored state riding in on a content fetch. */
  adopt(fieldState: Record<string, any>): void {
    this.state = updateResponseReducer(this.state, { event: ADOPT_FIELD_STATE, fieldState });
  }
}

/** An edit by someone who is not in this test, as a bare event. */
const editBy = (clientID: number, from: unknown, next: string) => ({
  event: 'SPLICE_INPUT',
  scope: 'component',
  id: BLOCK,
  field: 'notes',
  update: docSpliceUpdate(from, computeSplice(docText(from), next), clientID),
});

beforeEach(() => {
  initReducers({}, fieldInfosFrom({ notes: NOTES }));
});

describe('a document shared by several people', () => {
  it('keeps every edit when two type at once in different places', () => {
    const alice = new Client();     // this session, through docField.write
    const bob = new Client(2);
    const server = new Client(0);   // the materialization: folds, never types

    const opening = alice.type('The fox jumps over the dog');
    bob.receive(opening);
    server.receive(opening);

    // Neither has heard the other yet.
    const fromAlice = alice.type('The quick fox jumps over the dog');
    const fromBob = bob.type('The fox jumps over the lazy dog');

    // The relay, in whatever order each recipient happens to get it.
    bob.receive(fromAlice);
    alice.receive(fromBob);
    server.receive(fromBob);
    server.receive(fromAlice);

    expect(alice.text).toBe('The quick fox jumps over the lazy dog');
    expect(bob.text).toBe(alice.text);
    expect(server.text).toBe(alice.text);
  });

  it('agrees on the interleaving when two type in the same place', () => {
    const alice = new Client(1);
    const bob = new Client(2);

    const opening = alice.type('ab');
    bob.receive(opening);

    const fromAlice = alice.type('aXb');
    const fromBob = bob.type('aYb');
    bob.receive(fromAlice);
    alice.receive(fromBob);

    expect(alice.text).toBe(bob.text);
    expect(alice.text).toMatch(/^a(XY|YX)b$/);
  });

  it('converges for a third participant who receives everything reordered', () => {
    const alice = new Client(1);
    const bob = new Client(2);
    const carol = new Client(3);

    const events = [alice.type('one')];
    bob.receive(events[0]!);
    events.push(bob.type('one two'));
    alice.receive(events[1]!);
    events.push(alice.type('one two three'));
    bob.receive(events[2]!);

    for (const event of [...events].reverse()) carol.receive(event);
    expect(carol.text).toBe(alice.text);
    expect(carol.text).toBe('one two three');
  });

  it('is unmoved by redelivery', () => {
    const alice = new Client(1);
    const opening = alice.type('steady');
    const second = alice.type('steady on');

    alice.receive(opening);
    alice.receive(second);
    alice.receive(opening);
    expect(alice.text).toBe('steady on');
  });

  it('folds an edit whose dependencies arrive later', () => {
    const alice = new Client(1);
    const first = alice.type('start');
    const second = alice.type('start and more');

    const late = new Client(2);
    late.receive(second);
    late.receive(first);
    expect(late.text).toBe('start and more');
  });

  it('drops an unmergeable update instead of throwing out of the reducer', () => {
    // Two writers claiming one client ID is the one thing the algorithm
    // cannot merge, and the reason getClientId() is 48 random bits per
    // session and never 0: they address different characters with the same
    // (client, clock). Interleaving them silently would corrupt the
    // document, so the CRDT rejects — but a reducer that throws takes down
    // every LATER event too, so the rejection has to stop at the field.
    const warnings: unknown[][] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    try {
      const alice = new Client(7);
      const impostor = new Client(7);

      const opening = alice.type('shared start');
      impostor.receive(opening);
      const fromImpostor = impostor.type('shared start B');

      expect(() => alice.type('shared start A')).not.toThrow();
      expect(() => alice.receive(fromImpostor)).not.toThrow();
      expect(alice.text).toBe('shared start A');

      // …and the page keeps working for everything that follows.
      alice.receive(editBy(8, alice.raw, 'shared start A, still fine'));
      expect(alice.text).toBe('shared start A, still fine');
    } finally {
      console.warn = warn;
    }
    expect(warnings.flat().join(' ')).toMatch(/unmergeable document/);
  });

  it('leaves the bucket alone when the event carries no usable update', () => {
    const alice = new Client(1);
    alice.type('keep me');
    const before = alice.raw;

    alice.receive({ event: 'SPLICE_INPUT', scope: 'component', id: BLOCK, field: 'notes' });
    alice.receive({
      event: 'SPLICE_INPUT', scope: 'component', id: BLOCK, field: 'notes',
      update: { version: 9, structs: [], deletes: [] },
    });
    expect(alice.raw).toBe(before);
    expect(alice.text).toBe('keep me');
  });
});

describe('adopting stored state', () => {
  it('recovers a stored document instead of discarding it for local edits', () => {
    // The bucket exists locally the moment this session types, and the
    // fetch lands after. Bucket-granularity "local wins" would drop the
    // whole stored essay.
    const alice = new Client(1);
    alice.type('and one more thought');
    const storedEdit = editBy(2, undefined, 'An essay written last week.');
    const stored = updateResponseReducer(
      updateResponseReducer(undefined, { event: '@@INIT' }), storedEdit,
    );

    alice.adopt({ component: { [BLOCK]: stored.component[BLOCK] } });

    expect(alice.text).toContain('An essay written last week.');
    expect(alice.text).toContain('and one more thought');
  });

  it('still adopts a bucket this session never touched', () => {
    const alice = new Client(1);
    const storedEdit = editBy(2, undefined, 'stored');
    const stored = updateResponseReducer(
      updateResponseReducer(undefined, { event: '@@INIT' }), storedEdit,
    );

    alice.adopt({ component: { [BLOCK]: stored.component[BLOCK] } });
    expect(alice.text).toBe('stored');
  });

  it('merges a shared bucket rather than replacing the local copy', () => {
    const alice = new Client(1);
    alice.type('mine');
    const theirs = updateResponseReducer(
      updateResponseReducer(undefined, { event: '@@INIT' }),
      editBy(2, undefined, 'theirs'),
    );

    alice.adopt({ sharedComponent: { [BLOCK]: theirs.component[BLOCK] } });
    expect(alice.text).toContain('mine');
    expect(alice.text).toContain('theirs');
  });

  it('reaches the same document from either adoption order', () => {
    const first = editBy(1, undefined, 'alpha');
    const second = editBy(2, undefined, 'beta');
    const bucketOf = (event: Record<string, any>) =>
      updateResponseReducer(
        updateResponseReducer(undefined, { event: '@@INIT' }), event,
      ).component[BLOCK];

    const a = new Client(1);
    a.receive(first);
    a.adopt({ sharedComponent: { [BLOCK]: bucketOf(second) } });

    const b = new Client(2);
    b.receive(second);
    b.adopt({ sharedComponent: { [BLOCK]: bucketOf(first) } });

    expect(a.text).toBe(b.text);
  });

  it('leaves non-document state to the existing rules', () => {
    const alice = new Client(1);
    alice.state = updateResponseReducer(alice.state, {
      event: 'UPDATE_INPUT', scope: 'component', id: BLOCK, value: 'local',
    });
    alice.adopt({ component: { [BLOCK]: { value: 'stored' }, other: { value: 'new' } } });

    expect(alice.state.component[BLOCK].value).toBe('local');
    expect(alice.state.component.other.value).toBe('new');
  });
});

describe('two replicas seeded from different authored fallback text', () => {
  // The one document-layer case the CRDT cannot merge: two incarnations of
  // one field claiming the same seed IDs with different content (see
  // TODO(epochs) in crdt/docText.ts). Refusing is correct — interleaving
  // two unrelated baselines would produce an unreadable document. What
  // must NOT happen is the refusal escaping as an exception: these
  // boundaries are a Redux reducer, a connection handshake, and a
  // keystroke handler, where a throw costs far more than one field.

  const docFrom = (seed: string, next: string, client: number) =>
    foldDocUpdate(undefined, docSpliceUpdate(seed, computeSplice(seed, next), client));

  const MINE = () => docFrom('Write your answer here.', 'Write your answer here. A', 1);
  const THEIRS = () => docFrom('Answer below.', 'Answer below. B', 2);

  /** Run with console.warn captured, since every path here warns. */
  function quietly<T>(body: () => T): { result: T; warned: number } {
    const warn = console.warn;
    let warned = 0;
    console.warn = () => { warned++; };
    try { return { result: body(), warned }; }
    finally { console.warn = warn; }
  }

  it('keeps the local document when an incoming event cannot merge', () => {
    const alice = new Client(1);
    alice.state = updateResponseReducer(alice.state, {
      event: 'SPLICE_INPUT', scope: 'component', id: BLOCK, field: 'notes',
      update: MINE(),
    });
    const before = alice.text;

    const { warned } = quietly(() => alice.receive({
      event: 'SPLICE_INPUT', scope: 'component', id: BLOCK, field: 'notes',
      update: THEIRS(),
    }));

    expect(alice.text).toBe(before);
    expect(warned).toBeGreaterThan(0);
  });

  it('does not throw out of ADOPT_FIELD_STATE, and each route keeps its policy', () => {
    // A content fetch carrying stored state. The two routes resolve in
    // OPPOSITE directions by design, and an unmergeable document must fall
    // back to that policy rather than to an exception — or to a document
    // containing both baselines spliced together.
    const local = { component: { [BLOCK]: { notes: MINE() } } } as any;

    // Per-user: a bucket that exists locally came from this session, so
    // local wins.
    const own = quietly(() => updateResponseReducer(local, {
      event: ADOPT_FIELD_STATE,
      fieldState: { component: { [BLOCK]: { notes: THEIRS() } } },
    })).result;
    expect(docText(own.component[BLOCK].notes)).toBe('Write your answer here. A');

    // Shared: server-authoritative, so the incoming copy wins.
    const shared = quietly(() => updateResponseReducer(local, {
      event: ADOPT_FIELD_STATE,
      fieldState: { sharedComponent: { [BLOCK]: { notes: THEIRS() } } },
    })).result;
    expect(docText(shared.component[BLOCK].notes)).toBe('Answer below. B');
  });

  it('does not throw out of a keystroke', () => {
    // This client's in-flight document versus a store that holds the other
    // baseline — the write path combines the two, so it can hit the same
    // refusal while the learner is typing.
    const key = 'component|conflict|notes';
    const theirs = THEIRS();
    quietly(() => NOTES.write!(theirs as any, 'Answer below. B!', { key }));

    const { result } = quietly(() =>
      NOTES.write!(MINE() as any, 'Write your answer here. A!', { key }));
    expect(result).toHaveLength(1);
  });

  it('recovers: the next keystroke builds on what the store holds', () => {
    const key = 'component|recovery|notes';
    const theirs = THEIRS();
    quietly(() => NOTES.write!(theirs as any, 'Answer below. B!', { key }));

    const mine = MINE();
    quietly(() => NOTES.write!(mine as any, 'Write your answer here. A!', { key }));

    // The abandoned head must not keep poisoning later writes.
    const { result, warned } = quietly(() =>
      NOTES.write!(mine as any, 'Write your answer here. A!!', { key }));
    expect(result).toHaveLength(1);
    expect(warned).toBe(0);
  });
});
