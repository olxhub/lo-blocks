// @vitest-environment node
// packages/shared/lib/crdt/merge.test.ts
//
// Reconciling copies that never saw each other's events — the adopt and
// seed paths. The rule under test: the caller's preference is preserved
// exactly, except that documents present on both sides merge instead of
// one being dropped.

import { describe, it, expect } from 'vitest';
import { computeSplice } from './computeSplice';
import { docText, docSpliceUpdate, foldDocUpdate } from './docText';
import { mergeDocFields, hasMergeableDoc } from './merge';

/** A document containing `text`, written by `clientID`. */
const doc = (text: string, clientID: number) =>
  foldDocUpdate(undefined, docSpliceUpdate(undefined, computeSplice('', text), clientID));

/** `base`, edited to read `text` by `clientID` — a divergent copy. */
const editedFrom = (base: unknown, text: string, clientID: number) =>
  foldDocUpdate(base, docSpliceUpdate(base, computeSplice(docText(base), text), clientID));

describe('mergeDocFields', () => {
  it('returns the preferred bucket unchanged when nothing is a document', () => {
    const preferred = { value: 'local', score: 3 };
    const other = { value: 'stored', score: 1, extra: 'ignored' };
    expect(mergeDocFields(preferred, other)).toBe(preferred);
  });

  it('returns the preferred bucket unchanged when only one side is a document', () => {
    const preferred = { notes: doc('local', 1) };
    expect(mergeDocFields(preferred, { notes: 'a plain string' })).toBe(preferred);
    expect(mergeDocFields({ notes: 'a plain string' }, preferred)).toEqual({ notes: 'a plain string' });
  });

  it('keeps both sets of edits when both sides are documents', () => {
    // One shared starting point, then two sessions that never met.
    const shared = doc('The fox jumps over the dog', 1);
    const mine = editedFrom(shared, 'The quick fox jumps over the dog', 1);
    const stored = editedFrom(shared, 'The fox jumps over the lazy dog', 2);

    const merged = mergeDocFields({ notes: mine }, { notes: stored })!;
    expect(docText(merged.notes)).toBe('The quick fox jumps over the lazy dog');
  });

  it('recovers edits the preferred copy has never seen', () => {
    // The essay written last week, against a session that has typed one word.
    const lastWeek = doc('A long essay about foxes.', 2);
    const thisSession = editedFrom(undefined, 'Hm', 1);

    const merged = mergeDocFields({ notes: thisSession }, { notes: lastWeek })!;
    expect(docText(merged.notes)).toContain('A long essay about foxes.');
    expect(docText(merged.notes)).toContain('Hm');
  });

  it('leaves non-document fields to the caller\'s policy', () => {
    const mine = doc('mine', 1);
    const theirs = doc('theirs', 2);
    const merged = mergeDocFields(
      { notes: mine, score: 10, label: 'local' },
      { notes: theirs, score: 1, label: 'stored', absent: 'ignored' },
    )!;

    expect(merged.score).toBe(10);
    expect(merged.label).toBe('local');
    expect(merged).not.toHaveProperty('absent');
    expect(docText(merged.notes)).toContain('mine');
    expect(docText(merged.notes)).toContain('theirs');
  });

  it('is order-independent in what it produces', () => {
    const shared = doc('base', 1);
    const a = editedFrom(shared, 'base A', 1);
    const b = editedFrom(shared, 'base B', 2);

    const ab = mergeDocFields({ notes: a }, { notes: b })!;
    const ba = mergeDocFields({ notes: b }, { notes: a })!;
    expect(docText(ab.notes)).toBe(docText(ba.notes));
  });

  it('is idempotent — reconciling twice adds nothing', () => {
    const a = doc('one', 1);
    const b = doc('two', 2);
    const once = mergeDocFields({ notes: a }, { notes: b })!;
    const twice = mergeDocFields(once, { notes: b })!;
    expect(docText(twice.notes)).toBe(docText(once.notes));
  });

  it('passes absent buckets through', () => {
    expect(mergeDocFields(undefined, { notes: doc('x', 1) })).toBeUndefined();
    const only = { notes: doc('x', 1) };
    expect(mergeDocFields(only, undefined)).toBe(only);
  });
});

describe('hasMergeableDoc', () => {
  it('is true only when one field holds a document on both sides', () => {
    const a = doc('a', 1);
    const b = doc('b', 2);
    expect(hasMergeableDoc({ notes: a }, { notes: b })).toBe(true);
    expect(hasMergeableDoc({ notes: a }, { other: b })).toBe(false);
    expect(hasMergeableDoc({ notes: a }, { notes: 'string' })).toBe(false);
    expect(hasMergeableDoc({ value: 'x' }, { value: 'y' })).toBe(false);
    expect(hasMergeableDoc(undefined, { notes: b })).toBe(false);
    expect(hasMergeableDoc({ notes: a }, undefined)).toBe(false);
  });
});
