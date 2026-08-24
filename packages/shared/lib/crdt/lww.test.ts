// packages/shared/lib/crdt/lww.test.ts
//
// lwwMergeBuckets: the rule for two copies of a bucket that met without
// having seen each other's events. Same ordering as lwwReduce, applied a
// whole bucket at a time.

import { describe, test, expect } from 'vitest';
import { lwwMergeBuckets } from './lww';

const stamped = (field: string, value: any, ts: number, actor = 'a') => ({
  [field]: value, [`${field}.ts`]: ts, [`${field}.actor`]: actor,
});

describe('lwwMergeBuckets', () => {
  test('a newer incoming field wins', () => {
    expect(lwwMergeBuckets(stamped('value', 'old', 1), stamped('value', 'new', 2)))
      .toEqual(stamped('value', 'new', 2));
  });

  test('a STALE incoming field does not clobber the newer local one', () => {
    // The whole point: a snapshot that was assembled before the local
    // write must not undo it.
    expect(lwwMergeBuckets(stamped('value', 'new', 5), stamped('value', 'old', 2)))
      .toEqual(stamped('value', 'new', 5));
  });

  test('ties break on the higher actor, both directions', () => {
    expect(lwwMergeBuckets(stamped('v', 'mine', 3, 'zz'), stamped('v', 'theirs', 3, 'aa')))
      .toEqual(stamped('v', 'mine', 3, 'zz'));
    expect(lwwMergeBuckets(stamped('v', 'mine', 3, 'aa'), stamped('v', 'theirs', 3, 'zz')))
      .toEqual(stamped('v', 'theirs', 3, 'zz'));
  });

  test('untimestamped fields keep the old "incoming wins" behaviour', () => {
    // Server-derived buckets (aggregation folds, switchGroup blanks) carry
    // no LWW metadata; they must still land.
    expect(lwwMergeBuckets({ distribution: [1] }, { distribution: [2] }))
      .toEqual({ distribution: [2] });
  });

  test('fields only one side has are all kept', () => {
    const merged = lwwMergeBuckets(
      { ...stamped('a', 1, 1), local: 'keep' },
      { ...stamped('b', 2, 1) },
    );
    expect(merged).toEqual({ ...stamped('a', 1, 1), ...stamped('b', 2, 1), local: 'keep' });
  });

  test('per-field, not per-bucket: one stale field does not veto a fresh sibling', () => {
    const merged = lwwMergeBuckets(
      { ...stamped('value', 'newest', 9), ...stamped('note', 'old', 1) },
      { ...stamped('value', 'stale', 2), ...stamped('note', 'fresher', 4) },
    );
    expect(merged.value).toBe('newest');
    expect(merged['value.ts']).toBe(9);
    expect(merged.note).toBe('fresher');
    expect(merged['note.ts']).toBe(4);
  });

  test('bare `.ts`/`.actor` siblings are never merged as fields of their own', () => {
    // Merging them independently would let a stale bucket move a fresh
    // field's timestamp backwards without moving its value.
    const merged = lwwMergeBuckets(stamped('value', 'new', 5), { 'value.ts': 1 });
    expect(merged).toEqual(stamped('value', 'new', 5));
  });

  test('returns the base object itself when nothing changed', () => {
    const base = stamped('value', 'x', 5);
    expect(lwwMergeBuckets(base, stamped('value', 'y', 1))).toBe(base);
    expect(lwwMergeBuckets(base, base)).toBe(base);
  });

  test('missing sides are handled without inventing buckets', () => {
    expect(lwwMergeBuckets(undefined, { a: 1 })).toEqual({ a: 1 });
    expect(lwwMergeBuckets({ a: 1 }, undefined)).toEqual({ a: 1 });
    expect(lwwMergeBuckets(undefined, undefined)).toEqual({});
  });
});
