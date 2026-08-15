// packages/shared/lib/crdt/computeSplice.test.ts
//
// Tests for splice computation, with emphasis on Unicode correctness.
//
// computeSplice returns UTF-16 code unit indices — JavaScript's own string
// indices, and the units the sequence CRDT addresses (crdt/text/README.md).
// An astral character (emoji, CJK supplementary, musical symbol) is two of
// them and gets two clocks.
//
// The property the CRDT actually depends on is that a boundary never lands
// between the halves of one surrogate pair: half a character is not a
// character, and the CRDT does not normalize such a split to replacement
// characters. Boundaries that would split a pair widen outward instead, so
// the whole character is deleted and reinserted.
//
import { describe, it, expect } from 'vitest';
import { computeSplice } from './computeSplice';

/** Every index a splice names, as the CRDT will address them. */
function boundaries(
  oldStr: string,
  splice: { index: number; deleteCount: number; inserted: string },
): number[] {
  return [splice.index, splice.index + splice.deleteCount];
}

/** Does an index fall between the halves of one character? */
function splitsPair(value: string, index: number): boolean {
  if (index <= 0 || index >= value.length) return false;
  const left = value.charCodeAt(index - 1);
  const right = value.charCodeAt(index);
  return left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff;
}

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

  it('appends after emoji — UTF-16 index, past both code units', () => {
    // 😀 is U+1F600: 1 code point, 2 UTF-16 code units
    expect(computeSplice('😀', '😀x')).toEqual({ index: 2, deleteCount: 0, inserted: 'x' });
  });

  it('inserts emoji into ASCII text', () => {
    expect(computeSplice('ab', 'a😀b')).toEqual({ index: 1, deleteCount: 0, inserted: '😀' });
  });

  it('deletes emoji', () => {
    expect(computeSplice('a😀b', 'ab')).toEqual({ index: 1, deleteCount: 2, inserted: '' });
  });

  it('replaces emoji with emoji, widening past the shared high surrogate', () => {
    // 😀 and 🎉 share no code units, but 😀 and 😁 do — the prefix scan would
    // otherwise stop between the halves of both characters.
    expect(computeSplice('a😀b', 'a🎉b')).toEqual({ index: 1, deleteCount: 2, inserted: '🎉' });
    expect(computeSplice('a😀b', 'a😁b')).toEqual({ index: 1, deleteCount: 2, inserted: '😁' });
  });

  it('handles multiple emoji', () => {
    expect(computeSplice('😀😀😀', '😀🎉😀')).toEqual({ index: 2, deleteCount: 2, inserted: '🎉' });
  });

  it('appends after multiple emoji', () => {
    expect(computeSplice('😀😀', '😀😀x')).toEqual({ index: 4, deleteCount: 0, inserted: 'x' });
  });

  it('widens a suffix boundary that would split a pair', () => {
    // The common suffix scan matches the low surrogate of 😀 against the low
    // surrogate of 😀 before reaching the differing high surrogates.
    const result = computeSplice('a😀', 'b😀');
    expect(result).toEqual({ index: 0, deleteCount: 1, inserted: 'b' });
    for (const at of boundaries('a😀', result)) {
      expect(splitsPair('a😀', at)).toBe(false);
    }
  });

  // =========================================================================
  // CJK and supplementary characters
  // =========================================================================

  it('handles CJK basic (BMP — one code unit each)', () => {
    expect(computeSplice('你好', '你好世界')).toEqual({ index: 2, deleteCount: 0, inserted: '世界' });
  });

  it('handles CJK supplementary (astral)', () => {
    // 𠀀 is U+20000 (CJK Unified Ideographs Extension B) — 2 UTF-16 code units
    expect(computeSplice('a𠀀b', 'a𠀀xb')).toEqual({ index: 3, deleteCount: 0, inserted: 'x' });
  });

  // =========================================================================
  // Arabic (RTL) — BMP, but important for completeness
  // =========================================================================

  it('handles Arabic text insertion', () => {
    expect(computeSplice('مرحبا', 'مرحبا بالعالم')).toEqual({ index: 5, deleteCount: 0, inserted: ' بالعالم' });
  });

  it('handles Arabic text deletion', () => {
    expect(computeSplice('مرحبا بالعالم', 'مرحبا')).toEqual({ index: 5, deleteCount: 8, inserted: '' });
  });

  // =========================================================================
  // Mixed scripts
  // =========================================================================

  it('handles mixed emoji + CJK + ASCII', () => {
    expect(computeSplice('hello😀世界', 'hello😀你好世界')).toEqual({ index: 7, deleteCount: 0, inserted: '你好' });
  });

  // =========================================================================
  // Properties: the splice reproduces the new string, and never names an
  // index inside a character.
  // =========================================================================

  const applySplice = (
    str: string,
    splice: { index: number; deleteCount: number; inserted: string },
  ): string =>
    str.slice(0, splice.index) + splice.inserted + str.slice(splice.index + splice.deleteCount);

  const cases: [string, string][] = [
    ['hello', 'hello world'],
    ['', '😀'],
    ['😀', ''],
    ['a😀b', 'a🎉b'],
    ['a😀b', 'a😁b'],
    ['😀a', '😀b'],
    ['a😀', 'b😀'],
    ['😀', '😁'],
    ['مرحبا', 'مرحبا بالعالم'],
    ['hello😀世界', 'hello😀你好世界'],
    ['abc', 'axc'],
    ['😀😀😀', '😀x😀'],
    ['a𠀀b', 'axb'],
    ['𠀀𠀀', '𠀀x𠀀'],
    ['hello', 'hello'],
  ];

  for (const [oldStr, newStr] of cases) {
    it(`reproduces "${newStr}" from "${oldStr}"`, () => {
      expect(applySplice(oldStr, computeSplice(oldStr, newStr))).toBe(newStr);
    });

    it(`keeps every boundary between characters: "${oldStr}" → "${newStr}"`, () => {
      const splice = computeSplice(oldStr, newStr);
      for (const at of boundaries(oldStr, splice)) {
        expect(splitsPair(oldStr, at)).toBe(false);
      }
      expect(splitsPair(splice.inserted, 0)).toBe(false);
    });
  }
});
