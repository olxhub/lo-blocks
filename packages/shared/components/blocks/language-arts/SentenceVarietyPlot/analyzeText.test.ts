/**
 * Documents the input/output format of analyzeText.
 *
 * analyzeText(text, mode) → WordRow[]
 *
 * Input:  plain text with sentences and paragraphs
 * Output: one row per word, grouped by sentence number
 *
 *   { sentence: number,   — which bar (sequential, gaps for paragraph breaks)
 *     word: string,       — the cleaned word (letters + apostrophes only)
 *     height: number,     — character count (mode=characters) or 1 (mode=words)
 *     color: string }     — HSL color from golden-ratio rotation
 */
import { describe, it, expect } from 'vitest';
import { analyzeText, type WordRow } from './_SentenceVarietyPlot';

// Helper: just sentence numbers and words, ignoring colors
const summary = (rows: WordRow[]) => rows.map(r => [r.sentence, r.word, r.height]);

describe('analyzeText — input/output format', () => {
  it('splits sentences within a paragraph into adjacent bars', () => {
    const result = analyzeText('Hello world. Goodbye moon.', 'characters');
    expect(summary(result)).toEqual([
      [1, 'Hello', 5],
      [1, 'world', 5],
      [2, 'Goodbye', 7],
      [2, 'moon', 4],
    ]);
  });

  it('inserts a spacer row for paragraph breaks', () => {
    const result = analyzeText('First.\n\nSecond.', 'characters');
    const spacer = result.find(r => r.color === 'transparent');
    expect(spacer).toEqual({ sentence: 2, word: '', height: 0, color: 'transparent' });
    expect(result.filter(r => r.color !== 'transparent').map(r => r.sentence)).toEqual([1, 3]);
  });

  it('mode=words gives uniform height of 1 per word', () => {
    const result = analyzeText('Big small.', 'words');
    expect(result.map(r => r.height)).toEqual([1, 1]);
  });

  it('handles accented Latin characters', () => {
    const result = analyzeText('Café résumé.', 'characters');
    expect(result.map(r => r.word)).toEqual(['Café', 'résumé']);
    expect(result.map(r => r.height)).toEqual([4, 6]);
  });

  it('strips punctuation but keeps apostrophes', () => {
    const result = analyzeText("Don't stop!", 'characters');
    expect(result.map(r => r.word)).toEqual(["Don't", 'stop']);
  });

  // --- Multilingual ---

  it('Chinese: splits on 。！？ and treats each character as a word', () => {
    const result = analyzeText('你好吗？我很好。我叫鲍勃。我喜欢Unicode！', 'characters');
    const sentences = [...new Set(result.map(r => r.sentence))];
    expect(sentences).toEqual([1, 2, 3, 4]);
    expect(result.filter(r => r.sentence === 1).map(r => r.word)).toEqual(['你', '好', '吗']);
    const s4 = result.filter(r => r.sentence === 4).map(r => r.word);
    expect(s4).toEqual(['我', '喜', '欢', 'Unicode']);
  });

  it('Arabic: splits on ؟ and separates space-delimited words', () => {
    const result = analyzeText('كيف حالك؟ أنا بخير.', 'characters');
    const sentences = [...new Set(result.map(r => r.sentence))];
    expect(sentences).toEqual([1, 2]);
    expect(result.filter(r => r.sentence === 1).map(r => r.word)).toEqual(['كيف', 'حالك']);
    expect(result.filter(r => r.sentence === 2).map(r => r.word)).toEqual(['أنا', 'بخير']);
  });

  it('Spanish: handles ¿ and ¡ as stripped punctuation', () => {
    const result = analyzeText('¿Cómo estás? Estoy bien.', 'characters');
    const sentences = [...new Set(result.map(r => r.sentence))];
    expect(sentences).toEqual([1, 2]);
    expect(result.filter(r => r.sentence === 1).map(r => r.word)).toEqual(['Cómo', 'estás']);
    expect(result.filter(r => r.sentence === 2).map(r => r.word)).toEqual(['Estoy', 'bien']);
  });

  it('Japanese: splits hiragana/katakana character by character', () => {
    const result = analyzeText('これはテストです。', 'characters');
    expect(result.map(r => r.word)).toEqual(['こ', 'れ', 'は', 'テ', 'ス', 'ト', 'で', 'す']);
  });
});
