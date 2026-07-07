// packages/shared/lib/crdt/log.test.ts
//
// Log CRDT semantics: append idempotence, cross-actor ordering, the LWW
// clear watermark, and append-only whole-value writes.

import { logRead, logReduce, logWrite, newLogStamp } from './log';

/** Apply a LOG_APPEND for `item` with an explicit stamp. */
function append(state: Record<string, any>, item: unknown, ts: number, actor: string, n = 1) {
  const patch = logReduce(state, {
    type: 'LOG_APPEND', field: 'messages',
    opId: `${actor}:${ts}:${n}`, item, ts, actor, n,
  }, 'messages');
  return { ...state, ...patch };
}

describe('log CRDT', () => {
  test('appends materialize in (ts, actor, n) order regardless of arrival order', () => {
    let s: Record<string, any> = {};
    s = append(s, 'third', 300, 'bob');
    s = append(s, 'first', 100, 'alice');
    s = append(s, 'second-b', 200, 'bob');   // same ts, actor breaks tie
    s = append(s, 'second-a', 200, 'alice');
    expect(logRead(s.messages)).toEqual(['first', 'second-a', 'second-b', 'third']);
  });

  test('duplicate delivery of the same opId is a no-op', () => {
    let s: Record<string, any> = {};
    s = append(s, 'hello', 100, 'alice', 1);
    const patch = logReduce(s, {
      type: 'LOG_APPEND', field: 'messages',
      opId: 'alice:100:1', item: 'hello', ts: 100, actor: 'alice', n: 1,
    }, 'messages');
    expect(patch).toEqual({});
    expect(logRead(s.messages)).toEqual(['hello']);
  });

  test('identical items from different ops both appear (no dedupe by value)', () => {
    let s: Record<string, any> = {};
    s = append(s, 'same text', 100, 'alice', 1);
    s = append(s, 'same text', 101, 'alice', 2);
    expect(logRead(s.messages)).toEqual(['same text', 'same text']);
  });

  test('clear hides entries at or before the watermark; later appends survive', () => {
    let s: Record<string, any> = {};
    s = append(s, 'old', 100, 'alice');
    s = { ...s, ...logReduce(s, { type: 'LOG_CLEAR', field: 'messages', ts: 200, actor: 'alice' }, 'messages') };
    s = append(s, 'new', 300, 'bob');
    expect(logRead(s.messages)).toEqual(['new']);
    // A stale clear (older watermark) loses LWW and changes nothing.
    const stale = logReduce(s, { type: 'LOG_CLEAR', field: 'messages', ts: 150, actor: 'zed' }, 'messages');
    expect(stale).toEqual({});
  });

  test('logWrite appends the tail beyond the current items and rejects shrinking', () => {
    let s: Record<string, any> = {};
    s = append(s, 'a', 100, 'alice');
    const results = logWrite('messages')(s.messages, ['a', 'b', 'c']);
    expect(results.map(r => r.event)).toEqual(['LOG_APPEND', 'LOG_APPEND']);
    expect(results.map(r => (r.payload as any).item)).toEqual(['b', 'c']);
    expect(() => logWrite('messages')(s.messages, [])).toThrow(/append-only/);
  });

  test('read is memoized per doc and idempotent on materialized values', () => {
    let s: Record<string, any> = {};
    s = append(s, 'x', 100, 'alice');
    const a = logRead(s.messages);
    expect(logRead(s.messages)).toBe(a);   // same identity — selector-friendly
    expect(logRead(a)).toBe(a);            // already-materialized passthrough
  });

  test('newLogStamp yields distinct opIds within one millisecond', () => {
    const a = newLogStamp(100, 'alice');
    const b = newLogStamp(100, 'alice');
    expect(a.opId).not.toBe(b.opId);
  });
});
