// Pure analysis functions for WordUsage modes.
//
// Each function takes segmented text tokens and returns HighlightEntry[].
// No React, no Redux — pure computation.

import { segmentText, type TextToken } from '@/lib/textSegment';
import { groupHue } from '@/lib/util/colorWheel';
import type { HighlightEntry, HighlightSpan } from '@/lib/highlight';

export type { HighlightEntry, HighlightSpan } from '@/lib/highlight';

export type AnalysisMode =
  | 'repeated_words'
  | 'sentence_starters'
  | 'alliteration'
  | 'transition_words';

// ─── Stop words (English only — needs per-locale lists for other languages) ─

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'is', 'it', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'his',
  'her', 'they', 'them', 'their', 'this', 'that', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'not', 'no', 'so', 'if', 'with', 'as', 'by',
  'from', 'its', 'are', 'am', 'what', 'which', 'who', 'whom', 'how', 'when',
  'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'than', 'too', 'very', 'just', 'also', 'about', 'up', 'out',
  'then',
]);

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export function analyzeHighlights(
  text: string,
  mode: AnalysisMode,
  locale: string,
  options?: { words?: string },
): HighlightEntry[] {
  if (!text.trim()) return [];

  const tokens = segmentText(locale, text);
  if (tokens.length === 0) return [];

  switch (mode) {
    case 'repeated_words':
      return analyzeRepeatedWords(tokens);
    case 'sentence_starters':
      return analyzeSentenceStarters(tokens);
    case 'alliteration':
      return analyzeAlliteration(tokens);
    case 'transition_words':
      return analyzeTransitionWords(tokens, options?.words ?? '');
    default:
      return [];
  }
}

// ─── Repeated words ─────────────────────────────────────────────────────────

function analyzeRepeatedWords(tokens: TextToken[]): HighlightEntry[] {
  // Group by lowercased word, excluding stop words
  const groups = new Map<string, TextToken[]>();
  for (const t of tokens) {
    const key = t.text.toLowerCase();
    if (STOP_WORDS.has(key)) continue;
    const group = groups.get(key);
    if (group) group.push(t);
    else groups.set(key, [t]);
  }

  // Keep only words appearing 2+ times
  const repeated = [...groups.entries()].filter(([, toks]) => toks.length >= 2);
  if (repeated.length === 0) return [];

  const maxCount = Math.max(...repeated.map(([, toks]) => toks.length));

  return repeated.map(([word, toks], i) => {
    // Normalize frequency: 0 at count=2, 1 at count=maxCount
    const norm = maxCount > 2 ? (toks.length - 2) / (maxCount - 2) : 0;

    return {
      id: word,
      spans: toks.map(t => ({ offset: t.offset, length: t.length })),
      label: word,
      group: 'repeated_words',
      hue: groupHue(i),
      saturation: 0.3 + norm * 0.6,     // 0.3 → 0.9
      lightness: 0.9 - norm * 0.2,      // 0.9 → 0.7
    };
  });
}

// ─── Sentence starters ─────────────────────────────────────────────────────

function analyzeSentenceStarters(tokens: TextToken[]): HighlightEntry[] {
  // Find first token of each sentence
  const startersBySentence = new Map<number, TextToken>();
  for (const t of tokens) {
    if (!startersBySentence.has(t.sentence)) {
      startersBySentence.set(t.sentence, t);
    }
  }

  // Group by lowercased starter text
  const groups = new Map<string, TextToken[]>();
  for (const t of startersBySentence.values()) {
    const key = t.text.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(t);
    else groups.set(key, [t]);
  }

  const entries: HighlightEntry[] = [];
  let groupIndex = 0;
  const uniqueTokens: TextToken[] = [];

  for (const [word, toks] of groups) {
    if (toks.length >= 2) {
      // Repeated starter — vivid color
      entries.push({
        id: `starter-${word}`,
        spans: toks.map(t => ({ offset: t.offset, length: t.length })),
        label: word,
        group: 'sentence_starters',
        hue: groupHue(groupIndex++),
        saturation: 0.5,
        lightness: 0.85,
      });
    } else {
      // Unique starter — collect for dim gray group
      uniqueTokens.push(toks[0]);
    }
  }

  // All unique starters in one dim gray entry
  if (uniqueTokens.length > 0) {
    entries.push({
      id: 'starter-unique',
      spans: uniqueTokens.map(t => ({ offset: t.offset, length: t.length })),
      label: `${uniqueTokens.length} unique`,
      group: 'sentence_starters',
      hue: 0,
      saturation: 0,
      lightness: 0.9,
    });
  }

  return entries;
}

// ─── Alliteration ───────────────────────────────────────────────────────────

function analyzeAlliteration(tokens: TextToken[]): HighlightEntry[] {
  // Find runs of 2+ consecutive tokens sharing initial letter.
  // Runs do NOT break on sentence boundaries (alliteration is audible across
  // sentences). Stop words are transparent: they don't break runs and they
  // contribute to the run (the listener hears all the words).
  //
  // The "dominant letter" of a run is determined by non-stop-words only.
  // Stop words are buffered and only included when a subsequent content word
  // confirms the run continues — so trailing stop words don't get highlighted.
  const runs: { letter: string; tokens: TextToken[] }[] = [];
  let currentRun: TextToken[] = [];
  let pendingStops: TextToken[] = [];
  let currentLetter = '';

  function flushRun() {
    // Pending stop words are NOT included — they trail the run
    if (currentRun.length >= 2) {
      runs.push({ letter: currentLetter, tokens: [...currentRun] });
    }
    currentRun = [];
    pendingStops = [];
    currentLetter = '';
  }

  for (const t of tokens) {
    const isStop = STOP_WORDS.has(t.text.toLowerCase());
    const letter = t.text[0]?.toLowerCase() ?? '';

    if (isStop) {
      // Buffer stop words — only commit them when next content word confirms
      pendingStops.push(t);
    } else if (!currentLetter || letter === currentLetter) {
      if (currentRun.length > 0) {
        // Continuing an existing run — all bridging stop words join
        currentRun.push(...pendingStops);
      } else {
        // Starting a new run — only include stop words that share the letter
        for (const s of pendingStops) {
          if (s.text[0]?.toLowerCase() === letter) currentRun.push(s);
        }
      }
      pendingStops = [];
      currentLetter = letter;
      currentRun.push(t);
    } else {
      // Different non-stop letter — save pending stops before flushing
      // (flushRun clears pendingStops), then carry over matching ones
      const savedStops = pendingStops;
      flushRun();
      for (const s of savedStops) {
        if (s.text[0]?.toLowerCase() === letter) currentRun.push(s);
      }
      currentLetter = letter;
      currentRun.push(t);
    }
  }
  flushRun();

  if (runs.length === 0) return [];

  // Assign hues per letter
  const letterHues = new Map<string, number>();
  let letterIndex = 0;

  return runs.map((run, i) => {
    if (!letterHues.has(run.letter)) {
      letterHues.set(run.letter, groupHue(letterIndex++));
    }
    const hue = letterHues.get(run.letter)!;

    return {
      id: `allit-${run.letter}-${i}`,
      spans: run.tokens.map(t => ({ offset: t.offset, length: t.length })),
      label: `${run.letter}-`,
      group: 'alliteration',
      hue,
      saturation: 0.5,
      lightness: 0.85,
    };
  });
}

// ─── Transition words ───────────────────────────────────────────────────────

function analyzeTransitionWords(
  tokens: TextToken[],
  wordList: string,
): HighlightEntry[] {
  if (!wordList.trim()) return [];

  // Parse comma-separated list, supporting multi-word phrases
  const phrases = wordList
    .split(',')
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);

  // Separate single words and multi-word phrases
  const singleWords = new Set(phrases.filter(p => !p.includes(' ')));
  const multiPhrases = phrases
    .filter(p => p.includes(' '))
    .map(p => p.split(/\s+/));
  // Sort multi-word phrases longest-first to prefer longer matches
  multiPhrases.sort((a, b) => b.length - a.length);

  const entries = new Map<string, HighlightSpan[]>();

  // Check multi-word phrases first (sliding window)
  const used = new Set<number>(); // token indices already matched
  for (const phrase of multiPhrases) {
    const phraseKey = phrase.join(' ');
    for (let i = 0; i <= tokens.length - phrase.length; i++) {
      let anyUsed = false;
      for (let j = 0; j < phrase.length; j++) {
        if (used.has(i + j)) { anyUsed = true; break; }
      }
      if (anyUsed) continue;
      let match = true;
      const sentenceNum = tokens[i].sentence;
      for (let j = 0; j < phrase.length; j++) {
        if (tokens[i + j].sentence !== sentenceNum ||
            tokens[i + j].text.toLowerCase() !== phrase[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        const firstToken = tokens[i];
        const lastToken = tokens[i + phrase.length - 1];
        const span: HighlightSpan = {
          offset: firstToken.offset,
          length: lastToken.offset + lastToken.length - firstToken.offset,
        };
        const existing = entries.get(phraseKey);
        if (existing) existing.push(span);
        else entries.set(phraseKey, [span]);
        for (let j = 0; j < phrase.length; j++) used.add(i + j);
      }
    }
  }

  // Check single words
  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    const key = tokens[i].text.toLowerCase();
    if (singleWords.has(key)) {
      const span: HighlightSpan = { offset: tokens[i].offset, length: tokens[i].length };
      const existing = entries.get(key);
      if (existing) existing.push(span);
      else entries.set(key, [span]);
    }
  }

  return [...entries.entries()].map(([phrase, spans]) => ({
    id: `trans-${phrase}`,
    spans,
    label: phrase,
    group: 'transition_words',
    hue: 200,
    saturation: 0.4,
    lightness: 0.88,
  }));
}
