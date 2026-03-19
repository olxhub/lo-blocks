// Text segmentation utility — splits text into tokens with character offsets.
//
// Extracted from WritingRhythmPlot's analyzeText for cross-block reuse.
// Handles CJK character-by-character splitting, multilingual sentence splitting,
// and punctuation stripping while preserving apostrophes and Unicode letters.
//
// The locale parameter is accepted but unused in v1 — signals future
// Intl.Segmenter support for proper locale-aware tokenization.

// CJK Unified Ideographs, Extension A, Compatibility Ideographs,
// Hiragana, Katakana, Katakana Phonetic Extensions
const CJK = /[\u3040-\u30ff\u31f0-\u31ff\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

export interface TextToken {
  /** Cleaned word text (letters + apostrophes, no punctuation) */
  text: string;
  /** Original text from source (preserves punctuation, case) */
  raw: string;
  /** Character offset in source string */
  offset: number;
  /** Character length in source string (of raw) */
  length: number;
  /** 1-based sentence index (gaps for paragraph breaks) */
  sentence: number;
}

/**
 * Segment text into tokens with character offsets and sentence indices.
 *
 * @param _locale - BCP 47 locale string (reserved for future Intl.Segmenter support)
 * @param text - Source text to segment
 * @returns Array of TextToken with offset/length tracking back to source
 */
export function segmentText(_locale: string, text: string): TextToken[] {
  const lines = text.split(/\n/);
  const tokens: TextToken[] = [];
  let sentenceNum = 0;
  let lastWasEmpty = false;
  let lineStart = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      // Empty line = paragraph break → gap in sentence numbering
      if (!lastWasEmpty && sentenceNum > 0) {
        sentenceNum++;
      }
      lastWasEmpty = true;
      lineStart += line.length + 1; // +1 for \n
      continue;
    }
    lastWasEmpty = false;

    // Find where the trimmed content starts within the line
    const trimOffset = line.indexOf(trimmed[0]);
    const contentStart = lineStart + trimOffset;

    // Split into sentences. We use matchAll to find sentence-ending positions
    // so we can track offsets, rather than using split() which loses positions.
    const sentences = splitSentencesWithOffsets(trimmed, contentStart);

    for (const { text: sentenceText, offset: sentenceOffset } of sentences) {
      sentenceNum++;

      // Find whitespace-separated tokens with their positions
      for (const match of sentenceText.matchAll(/\S+/g)) {
        const raw = match[0];
        const tokenOffset = sentenceOffset + match.index!;

        if (CJK.test(raw)) {
          // Split CJK text into individual characters and non-CJK runs
          let run = '';
          let runStart = 0;

          for (let i = 0; i < raw.length; i++) {
            const char = raw[i];
            if (CJK.test(char)) {
              // Flush any accumulated non-CJK run
              if (run) {
                const cleaned = run.replace(/[^\p{L}'\u2018\u2019\u2032]/gu, '');
                if (cleaned) {
                  tokens.push({
                    text: cleaned,
                    raw: run,
                    offset: tokenOffset + runStart,
                    length: run.length,
                    sentence: sentenceNum,
                  });
                }
                run = '';
              }
              // Push CJK character as its own token
              tokens.push({
                text: char,
                raw: char,
                offset: tokenOffset + i,
                length: 1,
                sentence: sentenceNum,
              });
              runStart = i + 1;
            } else {
              if (!run) runStart = i;
              run += char;
            }
          }
          // Flush trailing non-CJK run
          if (run) {
            const cleaned = run.replace(/[^\p{L}'\u2018\u2019\u2032]/gu, '');
            if (cleaned) {
              tokens.push({
                text: cleaned,
                raw: run,
                offset: tokenOffset + runStart,
                length: run.length,
                sentence: sentenceNum,
              });
            }
          }
        } else {
          const cleaned = raw.replace(/[^\p{L}'\u2018\u2019\u2032]/gu, '');
          if (cleaned) {
            tokens.push({
              text: cleaned,
              raw,
              offset: tokenOffset,
              length: raw.length,
              sentence: sentenceNum,
            });
          }
        }
      }
    }

    lineStart += line.length + 1; // +1 for \n
  }

  return tokens;
}

/** Split a line into sentences, preserving character offsets. */
function splitSentencesWithOffsets(
  text: string,
  baseOffset: number,
): { text: string; offset: number }[] {
  // Find all sentence-ending positions
  const splitPoints: number[] = [];
  // Match sentence-ending punctuation followed by appropriate whitespace
  for (const m of text.matchAll(/[。！？؟]\s*|[.!?]\s+/g)) {
    splitPoints.push(m.index! + m[0].length);
  }

  if (splitPoints.length === 0) {
    const trimmed = text.trim();
    if (!trimmed) return [];
    return [{ text: trimmed, offset: baseOffset + text.indexOf(trimmed[0]) }];
  }

  const result: { text: string; offset: number }[] = [];
  let start = 0;

  for (const splitAt of splitPoints) {
    const slice = text.slice(start, splitAt).trim();
    if (slice) {
      // Find actual start position (skip leading whitespace)
      const firstChar = text.slice(start).search(/\S/);
      result.push({
        text: slice,
        offset: baseOffset + start + (firstChar >= 0 ? firstChar : 0),
      });
    }
    start = splitAt;
  }

  // Remaining text after last split point
  const remaining = text.slice(start).trim();
  if (remaining) {
    const firstChar = text.slice(start).search(/\S/);
    result.push({
      text: remaining,
      offset: baseOffset + start + (firstChar >= 0 ? firstChar : 0),
    });
  }

  return result;
}
