// @vitest-environment node
// packages/shared/components/blocks/language-arts/TextSelection/textSelection.test.ts
import { test, expect } from 'vitest';
import { parse } from './_textSelectionParser';
import {
  expectedSelections, computeStats, scoreFromStats, targetedFeedbackItems,
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
