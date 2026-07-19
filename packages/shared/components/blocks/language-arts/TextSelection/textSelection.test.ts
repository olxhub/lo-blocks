// @vitest-environment node
// packages/shared/components/blocks/language-arts/TextSelection/textSelection.test.ts
import { test, expect } from 'vitest';
import * as parserModule from './_textSelectionParser';
import {
  expectedSelections, computeStats, scoreFromStats, type ParsedDocument,
} from './textSelectionModel';

// The compiled peggy parser (grammar untouched). These cases pin the grammar.
const parser = (parserModule as any).default || parserModule;
const parseTextSelection = (input: string): ParsedDocument => parser.parse(input);

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

// --- Corrected subtractive scoring (owner ruling) ---
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

  // Every word selected → all required found, but the plain words are penalties,
  // so the score collapses (not 1).
  const everything = new Set<number>(expected.segments.flatMap(s => s.wordIndices));
  const onAll = computeStats(everything, expected);
  expect(onAll.requiredFound).toBe(2);
  expect(onAll.wrongSelected).toBeGreaterThan(0);
  expect(onAll.complete).toBe(false);
  expect(scoreFromStats(onAll)).toBeLessThan(1);
});