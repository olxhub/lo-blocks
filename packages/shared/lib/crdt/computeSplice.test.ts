// packages/shared/lib/crdt/computeSplice.test.ts
//
// Tests for splice computation, with emphasis on Unicode correctness.
//
// computeSplice must return code-point indices (not UTF-16 code unit indices)
// because the RGA layer iterates characters via for...of (code points).
// Astral characters (emoji, CJK supplementary, musical symbols) are one
// code point but two UTF-16 code units — wrong indexing corrupts collaborative text.
//
import { describe, it, expect } from 'vitest';
import { computeSplice } from './computeSplice';

describe('computeSplice', () => {
  // =========================================================================
  // Basic ASCII
  // =========================================================================

  it('detects no change', () => {
    const result = computeSplice('hello', 'hello');
    expect(result.deleteCount).toBe(0);
    expect(result.inserted).toBe('');
  });

  it('detects append', () => {
    expect(computeSplice('hello', 'hello world')).toEqual({ index: 5, deleteCount: 0, inserted: ' world' });
  });

  it('detects prepend', () => {
    expect(computeSplice('world', 'hello world')).toEqual({ index: 0, deleteCount: 0, inserted: 'hello ' });
  });

  it('detects delete', () => {
    expect(computeSplice('hello world', 'hello')).toEqual({ index: 5, deleteCount: 6, inserted: '' });
  });

  it('detects replacement', () => {
    expect(computeSplice('hello world', 'hello earth')).toEqual({ index: 6, deleteCount: 5, inserted: 'earth' });
  });

  it('handles empty to non-empty', () => {
    expect(computeSplice('', 'abc')).toEqual({ index: 0, deleteCount: 0, inserted: 'abc' });
  });

  it('handles non-empty to empty', () => {
    expect(computeSplice('abc', '')).toEqual({ index: 0, deleteCount: 3, inserted: '' });
  });

  it('handles both empty', () => {
    expect(computeSplice('', '')).toEqual({ index: 0, deleteCount: 0, inserted: '' });
  });

  // =========================================================================
  // Emoji (astral / surrogate pair characters)
  // =========================================================================

  it('appends after emoji — code point index, not UTF-16', () => {
    // 😀 is U+1F600: 1 code point, 2 UTF-16 code units
    const result = computeSplice('😀', '😀x');
    expect(result).toEqual({ index: 1, deleteCount: 0, inserted: 'x' });
    // UTF-16 would wrongly give index: 2
  });

  it('inserts emoji into ASCII text', () => {
    const result = computeSplice('ab', 'a😀b');
    expect(result).toEqual({ index: 1, deleteCount: 0, inserted: '😀' });
  });

  it('deletes emoji', () => {
    const result = computeSplice('a😀b', 'ab');
    expect(result).toEqual({ index: 1, deleteCount: 1, inserted: '' });
  });

  it('replaces emoji with emoji', () => {
    const result = computeSplice('a😀b', 'a🎉b');
    expect(result).toEqual({ index: 1, deleteCount: 1, inserted: '🎉' });
  });

  it('handles multiple emoji', () => {
    const result = computeSplice('😀😀😀', '😀🎉😀');
    expect(result).toEqual({ index: 1, deleteCount: 1, inserted: '🎉' });
  });

  it('appends after multiple emoji', () => {
    const result = computeSplice('😀😀', '😀😀x');
    expect(result).toEqual({ index: 2, deleteCount: 0, inserted: 'x' });
  });

  // =========================================================================
  // CJK and supplementary characters
  // =========================================================================

  it('handles CJK basic (BMP — no surrogate pairs)', () => {
    // CJK basic characters are in BMP, so code point === code unit count
    const result = computeSplice('你好', '你好世界');
    expect(result).toEqual({ index: 2, deleteCount: 0, inserted: '世界' });
  });

  it('handles CJK supplementary (astral)', () => {
    // 𠀀 is U+20000 (CJK Unified Ideographs Extension B) — 1 code point, 2 UTF-16 code units
    const result = computeSplice('a𠀀b', 'a𠀀xb');
    expect(result).toEqual({ index: 2, deleteCount: 0, inserted: 'x' });
  });

  // =========================================================================
  // Arabic (RTL) — BMP, but important for completeness
  // =========================================================================

  it('handles Arabic text insertion', () => {
    const result = computeSplice('مرحبا', 'مرحبا بالعالم');
    expect(result).toEqual({ index: 5, deleteCount: 0, inserted: ' بالعالم' });
  });

  it('handles Arabic text deletion', () => {
    const result = computeSplice('مرحبا بالعالم', 'مرحبا');
    expect(result).toEqual({ index: 5, deleteCount: 8, inserted: '' });
  });

  // =========================================================================
  // Mixed scripts
  // =========================================================================

  it('handles mixed emoji + CJK + ASCII', () => {
    const result = computeSplice('hello😀世界', 'hello😀你好世界');
    expect(result).toEqual({ index: 6, deleteCount: 0, inserted: '你好' });
  });

  // =========================================================================
  // Round-trip: applying the splice to oldStr produces newStr
  // =========================================================================

  function applySplice(str: string, splice: { index: number; deleteCount: number; inserted: string }): string {
    const cps = Array.from(str);
    cps.splice(splice.index, splice.deleteCount, ...Array.from(splice.inserted));
    return cps.join('');
  }

  const roundTripCases: [string, string][] = [
    ['hello', 'hello world'],
    ['', '😀'],
    ['😀', ''],
    ['a😀b', 'a🎉b'],
    ['مرحبا', 'مرحبا بالعالم'],
    ['hello😀世界', 'hello😀你好世界'],
    ['abc', 'axc'],
    ['😀😀😀', '😀x😀'],
    ['a𠀀b', 'axb'],
  ];

  for (const [oldStr, newStr] of roundTripCases) {
    it(`round-trip: "${oldStr}" → "${newStr}"`, () => {
      const splice = computeSplice(oldStr, newStr);
      expect(applySplice(oldStr, splice)).toBe(newStr);
    });
  }
});
