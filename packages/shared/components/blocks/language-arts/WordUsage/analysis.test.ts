import { describe, it, expect } from 'vitest';
import { analyzeHighlights } from './analysis';

describe('analyzeHighlights — repeated_words', () => {
  it('highlights words appearing 2+ times, excluding stop words', () => {
    const text = 'The big dog and the big cat.';
    const entries = analyzeHighlights(text, 'repeated_words', 'en');
    // "the" and "and" are stop words, "big" appears 2x
    expect(entries.map(e => e.id)).toEqual(['big']);
    expect(entries[0].spans).toHaveLength(2);
  });

  it('does not highlight words appearing only once', () => {
    const text = 'The cat sat on the mat.';
    const entries = analyzeHighlights(text, 'repeated_words', 'en');
    // "the" is a stop word, all content words appear once
    expect(entries).toHaveLength(0);
  });

  it('escalates saturation with frequency', () => {
    const text = 'Go go go go go. Run run.';
    const entries = analyzeHighlights(text, 'repeated_words', 'en');
    const goEntry = entries.find(e => e.id === 'go');
    const runEntry = entries.find(e => e.id === 'run');
    expect(goEntry).toBeDefined();
    expect(runEntry).toBeDefined();
    expect(goEntry!.saturation).toBeGreaterThan(runEntry!.saturation);
    expect(goEntry!.lightness).toBeLessThan(runEntry!.lightness);
    // Different words get different hues
    expect(goEntry!.hue).not.toBe(runEntry!.hue);
  });

  it('is case-insensitive', () => {
    const text = 'Hello hello HELLO.';
    const entries = analyzeHighlights(text, 'repeated_words', 'en');
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('hello');
    expect(entries[0].spans).toHaveLength(3);
  });

  it('returns empty for empty text', () => {
    expect(analyzeHighlights('', 'repeated_words', 'en')).toEqual([]);
    expect(analyzeHighlights('   ', 'repeated_words', 'en')).toEqual([]);
  });

  it('returns empty when all words are stop words', () => {
    const text = 'The and the or the.';
    const entries = analyzeHighlights(text, 'repeated_words', 'en');
    expect(entries).toHaveLength(0);
  });

  it('handles text without terminal punctuation', () => {
    const text = 'Go go go';
    const entries = analyzeHighlights(text, 'repeated_words', 'en');
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('go');
    expect(entries[0].spans).toHaveLength(3);
  });
});

describe('analyzeHighlights — sentence_starters', () => {
  it('gives repeated starters vivid colors', () => {
    const text = 'The cat sat. The dog ran. A bird flew.';
    const entries = analyzeHighlights(text, 'sentence_starters', 'en');
    const theEntry = entries.find(e => e.label === 'the');
    expect(theEntry).toBeDefined();
    expect(theEntry!.spans).toHaveLength(2);
    expect(theEntry!.saturation).toBe(0.5); // vivid
  });

  it('groups unique starters into one dim gray entry', () => {
    const text = 'The cat sat. The dog ran. A bird flew. Birds sing.';
    const entries = analyzeHighlights(text, 'sentence_starters', 'en');
    const uniqueEntry = entries.find(e => e.id === 'starter-unique');
    expect(uniqueEntry).toBeDefined();
    expect(uniqueEntry!.spans).toHaveLength(2); // "A" and "Birds"
    expect(uniqueEntry!.label).toBe('2 unique');
    expect(uniqueEntry!.saturation).toBe(0);   // dim gray
  });

  it('all unique — no repeated entries, just one gray group', () => {
    const text = 'Dogs run. Cats sit.';
    const entries = analyzeHighlights(text, 'sentence_starters', 'en');
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('starter-unique');
    expect(entries[0].label).toBe('2 unique');
  });

  it('handles single sentence', () => {
    const text = 'Hello world.';
    const entries = analyzeHighlights(text, 'sentence_starters', 'en');
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('starter-unique');
    expect(entries[0].label).toBe('1 unique');
  });
});

describe('analyzeHighlights — alliteration', () => {
  it('finds runs of 2+ consecutive same-initial words', () => {
    const text = 'Sally sells sea shells.';
    const entries = analyzeHighlights(text, 'alliteration', 'en');
    // All 4 words start with 's'
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('s-');
    expect(entries[0].spans).toHaveLength(4);
  });

  it('does not flag runs shorter than 2', () => {
    const text = 'The cat ran fast.';
    const entries = analyzeHighlights(text, 'alliteration', 'en');
    expect(entries).toHaveLength(0);
  });

  it('finds multiple runs in the same sentence', () => {
    const text = 'Big bad bears ate awesome apples.';
    const entries = analyzeHighlights(text, 'alliteration', 'en');
    // "Big bad bears" (b-) and "ate awesome apples" (a-)
    expect(entries).toHaveLength(2);
    const labels = entries.map(e => e.label).sort();
    expect(labels).toEqual(['a-', 'b-']);
  });

  it('spans across sentence boundaries', () => {
    const text = 'Sally sings. Sam sat.';
    const entries = analyzeHighlights(text, 'alliteration', 'en');
    // All 4 words start with 's' — one continuous run
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('s-');
    expect(entries[0].spans).toHaveLength(4);
  });

  it('stop words are transparent and contribute to runs', () => {
    const text = 'America the angle artist.';
    const entries = analyzeHighlights(text, 'alliteration', 'en');
    // "the" is a stop word — doesn't break the a- run, and is included
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('a-');
    expect(entries[0].spans).toHaveLength(4); // America, the, angle, artist
  });

  it('does not highlight trailing stop words after a run ends', () => {
    const text =
      'An American athlete asked about all apples. Although every American asks about them, he did not know.';
    const entries = analyzeHighlights(text, 'alliteration', 'en');
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('a-');
    // "An" (stop) buffered, committed when "American" starts 'a' run.
    // "American athlete asked" (content 'a') in run.
    // "about all" (stop words) buffered, then committed when "apples" matches.
    // "Although" (content 'a') continues.
    // "every" (stop) buffered, committed when "American" matches.
    // "American asks" (content 'a') in run.
    // "about them he did not" (stop words) buffered but never committed — "know" is 'k'.
    // So run = An, American, athlete, asked, about, all, apples, Although, every, American, asks
    expect(entries[0].spans).toHaveLength(11);
  });

  it('carries over matching stop words when letter changes', () => {
    const text = 'Big bad at all apples.';
    const entries = analyzeHighlights(text, 'alliteration', 'en');
    // "Big bad" = b-run (2). "at" and "all" are stop words starting with 'a',
    // carried over to the new 'a' run when "apples" is reached.
    expect(entries).toHaveLength(2);
    const bRun = entries.find(e => e.label === 'b-');
    const aRun = entries.find(e => e.label === 'a-');
    expect(bRun).toBeDefined();
    expect(aRun).toBeDefined();
    expect(bRun!.spans).toHaveLength(2); // Big, bad
    expect(aRun!.spans).toHaveLength(3); // at, all, apples
  });

  it('assigns same hue to same letter across separate runs', () => {
    const text = 'Sally sings loud. Bravo boy. Sam sat.';
    const entries = analyzeHighlights(text, 'alliteration', 'en');
    const sRuns = entries.filter(e => e.label === 's-');
    expect(sRuns).toHaveLength(2);
    expect(sRuns[0].hue).toBe(sRuns[1].hue);
  });
});

describe('analyzeHighlights — transition_words', () => {
  it('highlights words from the provided list', () => {
    const text = 'However, the plan failed. Therefore, we tried again.';
    const entries = analyzeHighlights(text, 'transition_words', 'en', {
      words: 'however, therefore, furthermore',
    });
    expect(entries.map(e => e.id).sort()).toEqual(['trans-however', 'trans-therefore']);
  });

  it('is case-insensitive', () => {
    const text = 'HOWEVER, it worked.';
    const entries = analyzeHighlights(text, 'transition_words', 'en', {
      words: 'however',
    });
    expect(entries).toHaveLength(1);
  });

  it('handles multi-word phrases', () => {
    const text = 'On the other hand, it could work.';
    const entries = analyzeHighlights(text, 'transition_words', 'en', {
      words: 'on the other hand, however',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('on the other hand');
  });

  it('returns empty when no words match', () => {
    const text = 'The cat sat.';
    const entries = analyzeHighlights(text, 'transition_words', 'en', {
      words: 'however, therefore',
    });
    expect(entries).toHaveLength(0);
  });

  it('returns empty when no word list provided', () => {
    const text = 'However, it worked.';
    const entries = analyzeHighlights(text, 'transition_words', 'en');
    expect(entries).toHaveLength(0);
  });

  it('does not match phrases across sentence boundaries', () => {
    const text = 'It was in fact. In another case it worked.';
    const entries = analyzeHighlights(text, 'transition_words', 'en', {
      words: 'in fact, in another',
    });
    // "in fact" matches in first sentence, "in another" matches in second
    // but "fact in" should NOT match across the period
    expect(entries.map(e => e.label).sort()).toEqual(['in another', 'in fact']);
  });
});
