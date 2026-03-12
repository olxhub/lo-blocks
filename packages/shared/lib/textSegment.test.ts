/**
 * Tests for segmentText — text segmentation with character offset tracking.
 *
 * segmentText(locale, text) → TextToken[]
 *
 * Each token has:
 *   text: string     — cleaned word (letters + apostrophes)
 *   raw: string      — original text from source
 *   offset: number   — character offset in source
 *   length: number   — character length in source (of raw)
 *   sentence: number — 1-based sentence index
 */
import { describe, it, expect } from 'vitest';
import { segmentText, type TextToken } from './textSegment';

// Helper: extract [sentence, text] pairs for readable assertions
const summary = (tokens: TextToken[]) => tokens.map(t => [t.sentence, t.text]);

// Helper: verify that every token's offset/length correctly indexes into the source
function verifyOffsets(text: string, tokens: TextToken[]) {
  for (const t of tokens) {
    const extracted = text.substring(t.offset, t.offset + t.length);
    expect(extracted).toBe(t.raw);
  }
}

describe('segmentText — basic splitting', () => {
  it('splits sentences within a paragraph', () => {
    const text = 'Hello world. Goodbye moon.';
    const tokens = segmentText('en', text);
    expect(summary(tokens)).toEqual([
      [1, 'Hello'],
      [1, 'world'],
      [2, 'Goodbye'],
      [2, 'moon'],
    ]);
    verifyOffsets(text, tokens);
  });

  it('handles paragraph breaks with sentence number gaps', () => {
    const text = 'First.\n\nSecond.';
    const tokens = segmentText('en', text);
    const sentences = tokens.map(t => t.sentence);
    // Sentence 1 for "First", gap at 2 for paragraph break, sentence 3 for "Second"
    expect(sentences).toEqual([1, 3]);
    verifyOffsets(text, tokens);
  });

  it('handles accented Latin characters', () => {
    const text = 'Café résumé.';
    const tokens = segmentText('en', text);
    expect(tokens.map(t => t.text)).toEqual(['Café', 'résumé']);
    verifyOffsets(text, tokens);
  });

  it('strips punctuation but keeps apostrophes', () => {
    const text = "Don't stop!";
    const tokens = segmentText('en', text);
    expect(tokens.map(t => t.text)).toEqual(["Don't", 'stop']);
    verifyOffsets(text, tokens);
  });

  it('handles multiple sentences on one line', () => {
    const text = 'One. Two. Three.';
    const tokens = segmentText('en', text);
    expect(summary(tokens)).toEqual([
      [1, 'One'],
      [2, 'Two'],
      [3, 'Three'],
    ]);
    verifyOffsets(text, tokens);
  });
});

describe('segmentText — offset accuracy', () => {
  it('offsets are correct for simple text', () => {
    const text = 'Hello world.';
    const tokens = segmentText('en', text);
    expect(tokens[0]).toMatchObject({ text: 'Hello', offset: 0, length: 5 });
    expect(tokens[1]).toMatchObject({ text: 'world', offset: 6, length: 6 });
    verifyOffsets(text, tokens);
  });

  it('offsets are correct across sentences', () => {
    const text = 'First. Second word.';
    const tokens = segmentText('en', text);
    verifyOffsets(text, tokens);
    // "Second" starts at position 7
    const second = tokens.find(t => t.text === 'Second');
    expect(second?.offset).toBe(7);
  });

  it('offsets are correct across lines', () => {
    const text = 'Line one.\nLine two.';
    const tokens = segmentText('en', text);
    verifyOffsets(text, tokens);
    // "Line" on second line starts after "Line one.\n" = 10 chars
    const lineTwoTokens = tokens.filter(t => t.sentence === 2);
    expect(lineTwoTokens[0]).toMatchObject({ text: 'Line', offset: 10 });
  });
});

describe('segmentText — multilingual', () => {
  it('Chinese: splits on 。！？ and treats each character as a word', () => {
    const text = '你好吗？我很好。';
    const tokens = segmentText('zh', text);
    const sentences = [...new Set(tokens.map(t => t.sentence))];
    expect(sentences).toEqual([1, 2]);
    expect(tokens.filter(t => t.sentence === 1).map(t => t.text)).toEqual(['你', '好', '吗']);
    expect(tokens.filter(t => t.sentence === 2).map(t => t.text)).toEqual(['我', '很', '好']);
    verifyOffsets(text, tokens);
  });

  it('Chinese with mixed CJK and Latin', () => {
    const text = '我喜欢Unicode！';
    const tokens = segmentText('zh', text);
    expect(tokens.map(t => t.text)).toEqual(['我', '喜', '欢', 'Unicode']);
    verifyOffsets(text, tokens);
  });

  it('Arabic: splits on ؟ and separates space-delimited words', () => {
    const text = 'كيف حالك؟ أنا بخير.';
    const tokens = segmentText('ar', text);
    const sentences = [...new Set(tokens.map(t => t.sentence))];
    expect(sentences).toEqual([1, 2]);
    expect(tokens.filter(t => t.sentence === 1).map(t => t.text)).toEqual(['كيف', 'حالك']);
    verifyOffsets(text, tokens);
  });

  it('Spanish: handles ¿ and ¡ as stripped punctuation', () => {
    const text = '¿Cómo estás? Estoy bien.';
    const tokens = segmentText('es', text);
    const sentences = [...new Set(tokens.map(t => t.sentence))];
    expect(sentences).toEqual([1, 2]);
    expect(tokens.filter(t => t.sentence === 1).map(t => t.text)).toEqual(['Cómo', 'estás']);
    verifyOffsets(text, tokens);
  });

  it('Japanese: splits hiragana/katakana character by character', () => {
    const text = 'これはテストです。';
    const tokens = segmentText('ja', text);
    expect(tokens.map(t => t.text)).toEqual(['こ', 'れ', 'は', 'テ', 'ス', 'ト', 'で', 'す']);
    verifyOffsets(text, tokens);
  });
});
