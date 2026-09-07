// @vitest-environment node
// packages/shared/components/blocks/language-arts/TextSelection/textSelection.test.ts
import { test, expect } from 'vitest';
import { parse } from './_textSelectionParser';
import {
  expectedSelections, computeStats, scoreFromStats, targetedFeedbackItems,
  projectParse, projectChunks, applyGesture, toggleChunks,
  type ParsedDocument,
} from './textSelectionModel';

// The compiled peggy parser (grammar untouched). These cases pin the grammar.
const parseTextSelection = (input: string): ParsedDocument => parse(input);

test('parses simple required highlights', () => {
  const input = `Highlight the nouns:
---
The [cat] sat on the [mat].`;

  const result = parseTextSelection(input);

  expect(result.prompt).toBe('Highlight the nouns:');
  expect(result.segments).toHaveLength(5);
  expect(result.segments[0]).toEqual({ type: 'text', content: 'The ' });
  expect(result.segments[1]).toEqual({ type: 'required', content: 'cat', id: null });
  expect(result.segments[2]).toEqual({ type: 'text', content: ' sat on the ' });
  expect(result.segments[3]).toEqual({ type: 'required', content: 'mat', id: null });
  expect(result.segments[4]).toEqual({ type: 'text', content: '.' });
});

test('parses optional highlights', () => {
  const input = `Find the nouns:
---
{The} [cat] sat on {the} [mat].`;

  const result = parseTextSelection(input);

  expect(result.segments).toHaveLength(8);
  expect(result.segments[0]).toEqual({ type: 'optional', content: 'The', id: null });
  expect(result.segments[1]).toEqual({ type: 'text', content: ' ' });
  expect(result.segments[2]).toEqual({ type: 'required', content: 'cat', id: null });
});

test('parses feedback triggers', () => {
  const input = `Find positive reinforcement:
---
They used [rewards] but also tried <<punishment>>.`;

  const result = parseTextSelection(input);

  expect(result.segments).toContainEqual({
    type: 'feedback_trigger',
    content: 'punishment',
    id: null
  });
});

test('parses labeled segments', () => {
  const input = `Find the techniques:
---
They used [positive reinforcement|pos] and [negative punishment|neg].`;

  const result = parseTextSelection(input);

  expect(result.segments).toContainEqual({
    type: 'required',
    content: 'positive reinforcement',
    id: 'pos'
  });
  expect(result.segments).toContainEqual({
    type: 'required',
    content: 'negative punishment',
    id: 'neg'
  });
});

test('parses scoring rules', () => {
  const input = `Find examples:
---
Here is [example one] and [example two].
---
all: Perfect! (2/2)
>1: Good start! (1/2)
: Keep trying. (0/2)`;

  const result = parseTextSelection(input);

  expect(result.scoring).toHaveLength(3);
  expect(result.scoring[0]).toEqual({
    condition: 'all',
    feedback: 'Perfect! (2/2)'
  });
  expect(result.scoring[1]).toEqual({
    condition: '>1',
    feedback: 'Good start! (1/2)'
  });
  expect(result.scoring[2]).toEqual({
    condition: '',
    feedback: 'Keep trying. (0/2)'
  });
});

test('parses targeted feedback', () => {
  const input = `Find the nouns:
---
The [cat|cat_id] sat on the <<chair>>.
---
all: Great job!
---
cat_id: That's right, cat is a noun!
chair: Close, but we're looking for what the cat sat ON.`;

  const result = parseTextSelection(input);

  expect(result.targetedFeedback).toHaveProperty('cat_id');
  expect(result.targetedFeedback.cat_id).toBe("That's right, cat is a noun!");
  expect(result.targetedFeedback).toHaveProperty('chair');
});

test('handles nested brackets correctly', () => {
  const input = `Find the noun phrases:
---
{The big} [cat] and [{the small} dog].`;

  const result = parseTextSelection(input);

  // Should parse as separate segments, not nested
  expect(result.segments).toContainEqual({ type: 'optional', content: 'The big', id: null });
  expect(result.segments).toContainEqual({ type: 'required', content: 'cat', id: null });
  expect(result.segments).toContainEqual({
    type: 'required',
    content: '{the small} dog',  // Preserves internal braces as text
    id: null
  });
});

test('handles content without mode directives', () => {
  const input = `Find the nouns:
---
The [cat] sat.`;

  const result = parseTextSelection(input);

  expect(result.prompt).toBe('Find the nouns:');
  expect(result.segments).toContainEqual({
    type: 'required',
    content: 'cat',
    id: null
  });
});

test('handles multiline text', () => {
  const input = `Find all positive reinforcement:
---
First, they tried [giving rewards|para1].

Then they used [praise|para2] consistently.

Finally, [sticker charts|para3] worked best.`;

  const result = parseTextSelection(input);

  const requiredSegments = result.segments.filter(s => s.type === 'required');
  expect(requiredSegments).toHaveLength(3);
  expect(requiredSegments[0].id).toBe('para1');
  expect(requiredSegments[1].id).toBe('para2');
  expect(requiredSegments[2].id).toBe('para3');
});

test('handles complex scoring conditions', () => {
  const input = `Find examples:
---
[First] and [second] and [third].
---
all: Perfect! All 3 found.
>2,errors<1: Almost there!
found>1,incorrect<2: Keep going.
: Try again.`;

  const result = parseTextSelection(input);

  expect(result.scoring).toContainEqual({
    condition: '>2,errors<1',
    feedback: 'Almost there!'
  });
  expect(result.scoring).toContainEqual({
    condition: 'found>1,incorrect<2',
    feedback: 'Keep going.'
  });
});

test('escapes special characters', () => {
  const input = `Find the arrays:
---
The function returns \\[array\\] not [real array].`;

  const result = parseTextSelection(input);

  // Escaped brackets should be plain text
  expect(result.segments).toContainEqual({
    type: 'text',
    content: 'The function returns [array] not '
  });
  expect(result.segments).toContainEqual({
    type: 'required',
    content: 'real array',
    id: null
  });
});

// --- Corrected subtractive scoring ---
// The old implementation divided requiredFound by totalRequired and never
// subtracted wrong picks, so "select every word" scored a perfect 1. The fix:
// score = clamp((requiredFound − wrongSelected) / totalRequired, 0, 1).
test('subtractive scoring: selecting every word does not earn full credit', () => {
  const parsed = parseTextSelection(`Highlight the nouns:
---
The [cat] sat on the [mat].`);
  const expected = expectedSelections(parsed);

  // Exactly the required phrases → full credit.
  const requiredOnly = new Set<number>(
    expected.segments.filter(s => s.type === 'required').flatMap(s => s.wordIndices),
  );
  const onKey = computeStats(requiredOnly, expected);
  expect(onKey.totalRequired).toBe(2);
  expect(onKey.requiredFound).toBe(2);
  expect(onKey.complete).toBe(true);
  expect(scoreFromStats(onKey)).toBe(1);

  // Every word selected → all required found, but the plain-text runs are
  // penalties. The plain words are "The" (0), "sat on the" (2,3,4), and "." (6):
  // three contiguous runs (the required "cat"/"mat" break them apart), so
  // wrongSelected is 3, not the 5 the old per-word rule charged. (2 − 3)/2 clamps
  // to 0, so a select-all still earns nothing.
  const everything = new Set<number>(expected.segments.flatMap(s => s.wordIndices));
  const onAll = computeStats(everything, expected);
  expect(onAll.requiredFound).toBe(2);
  expect(onAll.wrongSelected).toBe(3);
  expect(onAll.complete).toBe(false);
  expect(scoreFromStats(onAll)).toBe(0);
});

// --- Contiguous-mistake granularity for plain-text penalties ---
// A careless drag across a stretch of plain text is ONE mistake, not one per
// word: wrongSelected counts contiguous runs. Here four phrases are answered
// correctly and a five-word plain-text drag is the only slip, so the score is
// (4 − 1)/4 = 0.75 — not the (4 − 5)/4 = 0 the old per-word rule would have
// zeroed a nearly perfect answer down to.
test('contiguous mistakes: a five-word plain-text drag costs one error, not five', () => {
  const parsed = parseTextSelection(`Spot the animals:
---
The [cat] the [dog] the [bird] the [fox] then everyone quickly ran back home`);
  const expected = expectedSelections(parsed);

  const requiredWords = expected.segments
    .filter(s => s.type === 'required')
    .flatMap(s => s.wordIndices);

  // The five contiguous plain words after "fox": "then everyone quickly ran back".
  const dragRun = expected.segments
    .filter(s => s.type === 'text')
    .flatMap(s => s.wordIndices)
    .filter(i => i > Math.max(...requiredWords))
    .slice(0, 5);
  expect(dragRun).toHaveLength(5);

  const selection = new Set<number>([...requiredWords, ...dragRun]);
  const stats = computeStats(selection, expected);
  expect(stats.totalRequired).toBe(4);
  expect(stats.requiredFound).toBe(4);
  expect(stats.wrongSelected).toBe(1); // one contiguous run, not five words
  expect(scoreFromStats(stats)).toBeCloseTo(0.75);
});

// --- One predicate for scoring AND targeted feedback ---
// The bug: scoring counted a required phrase "found" only when EVERY word was
// selected, but the targeted-feedback display fired on ANY word — so selecting
// just "solar" scored 0/2 yet flashed "solar panels: Correct!". Both questions
// now go through isSegmentSelected (every word), so display can't contradict the
// score. This case is the spec: one word of a phrase → not found, no note.
test('predicate: one word of a required phrase is neither found nor acknowledged', () => {
  const parsed = parseTextSelection(`Identify renewable sources:
---
Power from [solar panels|solar] and <<coal plants|coal>>.
---
---
solar: Correct! Solar energy is renewable.
coal: Not quite — coal is a fossil fuel.`);
  const expected = expectedSelections(parsed);

  const solar = expected.segments.find(s => s.id === 'solar')!;
  expect(solar.wordIndices).toHaveLength(2); // "solar" + "panels"

  // One word of the two-word phrase: not found, and NO "Correct!" note.
  const onePartial = new Set<number>([solar.wordIndices[0]]);
  expect(computeStats(onePartial, expected).requiredFound).toBe(0);
  expect(targetedFeedbackItems(onePartial, expected)).toEqual([]);

  // Both words: found, and the note now appears — display tracks the score.
  const fullPhrase = new Set<number>(solar.wordIndices);
  expect(computeStats(fullPhrase, expected).requiredFound).toBe(1);
  expect(targetedFeedbackItems(fullPhrase, expected)).toEqual([
    { id: 'solar', label: 'solar panels', text: 'Correct! Solar energy is renewable.' },
  ]);
});

// ===========================================================================
// Chunk mode (`separatorRegexp`) and the gesture rules.
//
// Everything below is a decision table: an array of rows, each row a complete
// case, driven by one loop. A new case is a new row, never a new test body.
// ===========================================================================

const BLOCK_ID = 'demo_input';

/** Parse a passage body under a fixed prompt (the prompt is never the subject). */
const passage = (body: string): ParsedDocument => parseTextSelection(`Prompt:\n---\n${body}`);

/** The chunk projection for a passage body, as (text, wordIndices) rows. */
function chunksOf(body: string, separatorRegexp: string, separatorHidden: boolean) {
  const parsed = passage(body);
  const { tokens, expected } = projectParse(parsed);
  const { chunks } = projectChunks(tokens, expected, separatorRegexp, separatorHidden, BLOCK_ID);
  return chunks.map(c => [c.text, c.wordIndices] as [string, number[]]);
}

// --- Chunk projection ------------------------------------------------------
//
// `hidden: false` keeps the match at the end of the left chunk and renders it;
// `hidden: true` consumes it and normalises the whitespace around it. Word
// indices come from the ONE tokenization and never shift, so they are the
// column that proves the stored value is unchanged.
const CHUNK_PROJECTION_TABLE: {
  name: string;
  body: string;
  separator: string;
  hidden: boolean;
  chunks: [string, number[]][];
}[] = [
  {
    name: 'sentences on "\\." keep their period and split on it',
    body: 'The cat sat. The dog ran. Birds flew.',
    separator: '\\.',
    hidden: false,
    chunks: [
      ['The cat sat.', [0, 1, 2]],
      ['The dog ran.', [3, 4, 5]],
      ['Birds flew.', [6, 7]],
    ],
  },
  {
    name: 'hand-placed "\\|" markers, hidden, never render',
    body: 'Such | intrusions | by the middle class',
    separator: '\\|',
    hidden: true,
    chunks: [
      ['Such', [0]],
      ['intrusions', [2]],
      ['by the middle class', [4, 5, 6, 7]],
    ],
  },
  {
    name: 'the same markers, shown, render as content in the left chunk',
    body: 'Such | intrusions | by the middle class',
    separator: '\\|',
    hidden: false,
    chunks: [
      ['Such |', [0, 1]],
      ['intrusions |', [2, 3]],
      ['by the middle class', [4, 5, 6, 7]],
    ],
  },
  {
    name: 'a marker fused to the preceding word is stripped, not dropped',
    body: 'Such| intrusions| by the middle class',
    separator: '\\|',
    hidden: true,
    chunks: [
      ['Such', [0]],
      ['intrusions', [1]],
      ['by the middle class', [2, 3, 4, 5]],
    ],
  },
  {
    name: 'a marker fused to the FOLLOWING word opens the new chunk',
    body: 'Such |intrusions |by the middle class',
    separator: '\\|',
    hidden: true,
    chunks: [
      ['Such', [0]],
      ['intrusions', [1]],
      ['by the middle class', [2, 3, 4, 5]],
    ],
  },
  {
    name: 'a separator at the end of the passage adds no empty chunk',
    body: 'The cat sat. The dog ran.',
    separator: '\\.',
    hidden: false,
    chunks: [
      ['The cat sat.', [0, 1, 2]],
      ['The dog ran.', [3, 4, 5]],
    ],
  },
  {
    name: 'consecutive separators inside one word are one boundary',
    body: 'One... Two.',
    separator: '\\.',
    hidden: false,
    chunks: [
      ['One...', [0]],
      ['Two.', [1]],
    ],
  },
  {
    name: 'consecutive hidden separators collapse to one boundary',
    body: 'Such || intrusions',
    separator: '\\|',
    hidden: true,
    chunks: [
      ['Such', [0]],
      ['intrusions', [2]],
    ],
  },
  {
    name: 'no occurrence: the whole passage is one chunk',
    body: 'The cat sat on the mat',
    separator: '\\.',
    hidden: false,
    chunks: [
      ['The cat sat on the mat', [0, 1, 2, 3, 4, 5]],
    ],
  },
  {
    name: 'hidden separators normalise whitespace so words never run together',
    body: 'Such    |\n  intrusions   |   by the class',
    separator: '\\|',
    hidden: true,
    chunks: [
      ['Such', [0]],
      ['intrusions', [2]],
      ['by the class', [4, 5, 6]],
    ],
  },
  {
    name: 'a lookbehind pattern splits on the whitespace and keeps the period',
    body: 'The cat sat. The dog ran! Birds flew?',
    separator: '(?<=[.!?])\\s+',
    hidden: true,
    chunks: [
      ['The cat sat.', [0, 1, 2]],
      ['The dog ran!', [3, 4, 5]],
      ['Birds flew?', [6, 7]],
    ],
  },
  {
    name: 'a required span wholly inside one chunk is fine',
    body: 'The cat sat. [The dog ran.] Birds flew.',
    separator: '\\.',
    hidden: false,
    chunks: [
      ['The cat sat.', [0, 1, 2]],
      ['The dog ran.', [3, 4, 5]],
      ['Birds flew.', [6, 7]],
    ],
  },
  {
    name: 'an optional span wholly inside one chunk is fine',
    body: 'The cat sat. {The dog} ran. Birds flew.',
    separator: '\\.',
    hidden: false,
    chunks: [
      ['The cat sat.', [0, 1, 2]],
      ['The dog ran.', [3, 4, 5]],
      ['Birds flew.', [6, 7]],
    ],
  },
];

for (const row of CHUNK_PROJECTION_TABLE) {
  test(`chunk projection: ${row.name}`, () => {
    expect(chunksOf(row.body, row.separator, row.hidden)).toEqual(row.chunks);
  });
}

// --- Chunk projection: authoring errors ------------------------------------
//
// Each row is a passage the projection must REFUSE, plus a fragment the message
// has to carry so the author can find what to fix.
const CHUNK_ERROR_TABLE: {
  name: string;
  body: string;
  separator: string;
  hidden: boolean;
  message: RegExp;
}[] = [
  {
    name: 'a required span crossing a boundary',
    body: 'The cat sat. [The dog ran. Birds] flew.',
    separator: '\\.',
    hidden: false,
    message: /marked span "The dog ran\. Birds" crosses a separator boundary/,
  },
  {
    name: 'a decoy span crossing a boundary',
    body: 'The cat sat. <<The dog ran. Birds>> flew.',
    separator: '\\.',
    hidden: false,
    message: /marked span "The dog ran\. Birds" crosses a separator boundary/,
  },
  {
    name: 'a required span crossing a hidden marker',
    body: 'Such ; [intrusions ; by] the class',
    separator: ';',
    hidden: true,
    message: /marked span "intrusions ; by" crosses a separator boundary/,
  },
  {
    name: 'the boundary and the block are named in the message',
    body: 'The cat sat. [The dog ran. Birds] flew.',
    separator: '\\.',
    hidden: false,
    message: /TextSelectionInput demo_input.*chunks 1 and 2/s,
  },
  {
    name: 'a regexp the RegExp constructor rejects',
    body: 'The cat sat.',
    separator: '(unclosed',
    hidden: false,
    message: /is not a valid regular expression/,
  },
  {
    name: 'a regexp that matches the empty string',
    body: 'The cat sat.',
    separator: '\\.*',
    hidden: false,
    message: /matches the empty string/,
  },
];

for (const row of CHUNK_ERROR_TABLE) {
  test(`chunk projection error: ${row.name}`, () => {
    expect(() => chunksOf(row.body, row.separator, row.hidden)).toThrow(row.message);
  });
}

// --- The value a chunk gesture writes --------------------------------------
//
// The stored value is still the array of selected word indices: selecting a
// chunk writes all of its indices, deselecting removes exactly those. Chunks
// are named by index into the projection of `CHUNK_VALUE_BODY`.
const CHUNK_VALUE_BODY = 'The cat sat. The dog ran. Birds flew.';

const CHUNK_VALUE_TABLE: {
  name: string;
  before: number[];
  touch: number[];       // chunk indices the gesture touched
  after: number[];       // the stored value, ascending
}[] = [
  { name: 'selecting a chunk writes all of its word indices',
    before: [], touch: [1], after: [3, 4, 5] },
  { name: 'selecting a second chunk adds to the value',
    before: [3, 4, 5], touch: [0], after: [0, 1, 2, 3, 4, 5] },
  { name: 'deselecting a fully selected chunk removes exactly its indices',
    before: [0, 1, 2, 3, 4, 5], touch: [1], after: [0, 1, 2] },
  { name: 'a partly selected chunk fills rather than clears',
    before: [3], touch: [1], after: [3, 4, 5] },
  { name: 'a drag across several chunks flips each one on its own state',
    before: [0, 1, 2], touch: [0, 1], after: [3, 4, 5] },
  { name: 'a drag touching no chunk leaves the value alone',
    before: [3, 4, 5], touch: [], after: [3, 4, 5] },
];

for (const row of CHUNK_VALUE_TABLE) {
  test(`chunk value: ${row.name}`, () => {
    const parsed = passage(CHUNK_VALUE_BODY);
    const { tokens, expected } = projectParse(parsed);
    const { chunks } = projectChunks(tokens, expected, '\\.', false, BLOCK_ID);
    const touched = row.touch.map(i => chunks[i]);
    const next = toggleChunks(new Set(row.before), touched);
    expect([...next].sort((a, b) => a - b)).toEqual(row.after);
  });
}

// --- The token-mode gesture rule: set vs clear -----------------------------
//
// A gesture that begins on an UNSELECTED word selects every word it touches; a
// gesture that begins on a SELECTED word clears every word it touches. A single
// click is the one-word case of the same rule, so it still reads as a toggle.
const GESTURE_TABLE: {
  name: string;
  before: number[];
  touched: number[];
  anchor: number | null;
  after: number[];
}[] = [
  { name: 'single click on an unselected word selects it',
    before: [], touched: [2], anchor: 2, after: [2] },
  { name: 'single click on a selected word deselects it',
    before: [2], touched: [2], anchor: 2, after: [] },
  { name: 'a drag beginning on an unselected word selects the whole span',
    before: [], touched: [1, 2, 3], anchor: 1, after: [1, 2, 3] },
  { name: 'a drag beginning on an unselected word over a partly selected span sets all of it',
    before: [2], touched: [1, 2, 3], anchor: 1, after: [1, 2, 3] },
  { name: 'a corrective drag beginning on a selected word clears the whole span',
    before: [1, 2, 3], touched: [2, 3], anchor: 3, after: [1] },
  { name: 'a corrective drag over an overshoot leaves the correct words alone',
    before: [1, 2, 3, 4, 5], touched: [4, 5], anchor: 4, after: [1, 2, 3] },
  { name: 'a clearing drag over words that were never selected is a no-op on them',
    before: [1], touched: [1, 2, 3], anchor: 1, after: [] },
  { name: 'a drag anchored on whitespace takes its direction from the first touched word',
    before: [], touched: [4, 5], anchor: null, after: [4, 5] },
  { name: 'a drag anchored on whitespace over a selected first word clears',
    before: [4, 5], touched: [4, 5], anchor: null, after: [] },
  { name: 'an anchor outside the touched set falls back to the first touched word',
    before: [], touched: [4, 5], anchor: 9, after: [4, 5] },
  { name: 'an empty gesture leaves the selection alone',
    before: [1, 2], touched: [], anchor: 1, after: [1, 2] },
];

for (const row of GESTURE_TABLE) {
  test(`token gesture: ${row.name}`, () => {
    const next = applyGesture(new Set(row.before), new Set(row.touched), row.anchor);
    expect([...next].sort((a, b) => a - b)).toEqual(row.after);
  });
}

// --- Token mode is untouched by the feature --------------------------------
//
// The projection of a passage with no `separatorRegexp` is what it always was:
// the same word indices, and the same scoring off them.
const TOKEN_MODE_TABLE: {
  name: string;
  body: string;
  words: string[];
  select: number[];
  found: number;
  errors: number;
  score: number;
}[] = [
  { name: 'required phrases only',
    body: 'The [cat] sat on the [mat].',
    words: ['The', 'cat', 'sat', 'on', 'the', 'mat', '.'],
    select: [1, 5], found: 2, errors: 0, score: 1 },
  { name: 'everything selected costs one error per contiguous plain run',
    body: 'The [cat] sat on the [mat].',
    words: ['The', 'cat', 'sat', 'on', 'the', 'mat', '.'],
    select: [0, 1, 2, 3, 4, 5, 6], found: 2, errors: 3, score: 0 },
  { name: 'a five-word plain drag is one error, not five',
    body: 'The [cat] the [dog] the [bird] the [fox] then everyone quickly ran back home',
    words: ['The', 'cat', 'the', 'dog', 'the', 'bird', 'the', 'fox',
            'then', 'everyone', 'quickly', 'ran', 'back', 'home'],
    select: [1, 3, 5, 7, 8, 9, 10, 11, 12], found: 4, errors: 1, score: 0.75 },
  { name: 'one word of a two-word required phrase is not found',
    body: 'Power from [solar panels] and coal.',
    words: ['Power', 'from', 'solar', 'panels', 'and', 'coal.'],
    select: [2], found: 0, errors: 0, score: 0 },
  { name: 'a touched decoy is one error',
    body: 'They used [rewards] but also tried <<punishment>>.',
    words: ['They', 'used', 'rewards', 'but', 'also', 'tried', 'punishment', '.'],
    select: [2, 6], found: 1, errors: 1, score: 0 },
  { name: 'optional words never help nor hurt',
    body: '{The} [cat] sat on {the} [mat].',
    words: ['The', 'cat', 'sat', 'on', 'the', 'mat', '.'],
    select: [0, 1, 4, 5], found: 2, errors: 0, score: 1 },
];

for (const row of TOKEN_MODE_TABLE) {
  test(`token mode unchanged: ${row.name}`, () => {
    const parsed = passage(row.body);
    const { tokens, expected } = projectParse(parsed);
    expect(tokens.filter(t => !t.isSpace).map(t => t.text)).toEqual(row.words);
    const stats = computeStats(new Set(row.select), expected);
    expect(stats.requiredFound).toBe(row.found);
    expect(stats.wrongSelected).toBe(row.errors);
    expect(scoreFromStats(stats)).toBeCloseTo(row.score);
  });
}

// --- Grading is blind to chunk mode ----------------------------------------
//
// The same passage, graded from the same stored value, scores identically with
// and without a separator: chunk mode changes what the learner can click, not
// what the grader reads.
const GRADING_PARITY_TABLE: {
  name: string;
  body: string;
  separator: string;
  select: number[];
  found: number;
  errors: number;
}[] = [
  { name: 'the required sentence selected',
    body: 'The cat sat. [The dog ran.] Birds flew.',
    separator: '\\.', select: [3, 4, 5], found: 1, errors: 0 },
  { name: 'a wrong sentence selected',
    body: 'The cat sat. [The dog ran.] Birds flew.',
    separator: '\\.', select: [0, 1, 2], found: 0, errors: 1 },
  { name: 'nothing selected',
    body: 'The cat sat. [The dog ran.] Birds flew.',
    separator: '\\.', select: [], found: 0, errors: 0 },
];

for (const row of GRADING_PARITY_TABLE) {
  test(`grading parity: ${row.name}`, () => {
    const parsed = passage(row.body);
    const withoutSeparator = computeStats(new Set(row.select), projectParse(parsed).expected);

    const chunked = passage(row.body);
    const { tokens, expected } = projectParse(chunked);
    projectChunks(tokens, expected, row.separator, false, BLOCK_ID);
    const withSeparator = computeStats(new Set(row.select), expected);

    expect(withSeparator).toEqual(withoutSeparator);
    expect(withSeparator.requiredFound).toBe(row.found);
    expect(withSeparator.wrongSelected).toBe(row.errors);
  });
}
