import { describe, expect, it } from 'vitest';
import { asContentNamespace } from '@/lib/types/id-grammar';
import {
  canonicalKidCursorValue,
  canonicalKidId,
  kidCursorIds,
  resolveKidCursor,
} from './kidCursor';

const NS = asContentNamespace('course');
const IDS = [
  canonicalKidId('first', NS),
  canonicalKidId('second', NS),
  canonicalKidId('third', NS),
];

describe('kid cursor identity', () => {
  it('canonicalizes bare refs but preserves explicit namespaces', () => {
    expect(canonicalKidId('first', NS)).toBe('course/first');
    expect(canonicalKidId('library/first', NS)).toBe('library/first');
    expect(canonicalKidCursorValue('first', NS)).toBe('course/first');
  });

  it('requires an ID on every child and rejects ambiguous repeated refs', () => {
    expect(() => kidCursorIds([{ type: 'text', text: 'nope' }], NS, 'tabs'))
      .toThrow(/child 1 has no id/);
    expect(() => kidCursorIds([{ id: 'same' }, { id: 'same' }], NS, 'tabs'))
      .toThrow(/more than once/);
  });

  it('keeps differently-namespaced definitions distinct', () => {
    expect(kidCursorIds([{ id: 'one/item' }, { id: 'two/item' }], NS, 'tabs'))
      .toEqual(['one/item', 'two/item']);
  });
});

describe('resolveKidCursor', () => {
  it('resolves an exact identity', () => {
    expect(resolveKidCursor(IDS[1], IDS)).toEqual({
      index: 1,
      id: IDS[1],
      healed: false,
    });
  });

  it('preserves the active identity when an earlier when= child disappears', () => {
    expect(resolveKidCursor(IDS[2], [IDS[0], IDS[2]], 2)).toEqual({
      index: 1,
      id: IDS[2],
      healed: false,
    });
  });

  it('falls back near the previous position when the active child disappears', () => {
    expect(resolveKidCursor(IDS[1], [IDS[0], IDS[2]], 1)).toEqual({
      index: 1,
      id: IDS[2],
      healed: true,
    });
  });

  it('reads and heals legacy positions, including numeric strings', () => {
    expect(canonicalKidCursorValue('2', NS)).toBe(2);
    expect(resolveKidCursor(2, IDS)).toEqual({ index: 2, id: IDS[2], healed: true });
    expect(resolveKidCursor(99, IDS).index).toBe(2);
    expect(resolveKidCursor(-1, IDS).index).toBe(0);
  });

  it('uses the first child for unset state without inventing an empty result', () => {
    expect(resolveKidCursor(null, IDS)).toEqual({
      index: 0,
      id: IDS[0],
      healed: true,
    });
    expect(resolveKidCursor(null, [])).toEqual({ index: -1, id: null, healed: false });
  });

  it('fails fast on malformed stored state', () => {
    expect(() => canonicalKidCursorValue({}, NS)).toThrow(/child id or integer/);
    expect(() => canonicalKidCursorValue('not a ref!', NS)).toThrow(/valid DefinitionRef/);
  });
});
