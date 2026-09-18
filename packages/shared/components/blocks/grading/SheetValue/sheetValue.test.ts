// Reading one value back out of a published slot sheet.
//
// The sheet is a JSON string in a field, so every consumer that wants a single
// judgement out of it has to parse it. Getting that wrong is quiet: a student
// sees an empty sentence, or a raw quotation mark, rather than an error.
import { describe, it, expect } from 'vitest';
import { readSheetValue, unquote } from './_SheetValue';

// INVENTED FIXTURE TEXT. This test asserts that readSheetValue returns the
// evidence string it was handed, so the content is irrelevant to what is being
// tested. It previously carried a real psychology submission verbatim -- one
// student's answer, in an engine package that is meant to be content-neutral.
const sheet = JSON.stringify({
  slots: [{ key: 'utb_stated', label: 'x', options: ['met'], gates: false }],
  showChecks: true,
  verdicts: {
    utb_stated: {
      verdict: 'met',
      evidence: '"My unwanted behavior is skipping breakfast."',
      note: 'You name it directly.',
    },
  },
});

describe('readSheetValue', () => {
  it('reads each part of a named check', () => {
    expect(readSheetValue(sheet, 'utb_stated', 'verdict')).toBe('met');
    expect(readSheetValue(sheet, 'utb_stated', 'note')).toBe('You name it directly.');
    expect(readSheetValue(sheet, 'utb_stated', 'evidence'))
      .toBe('"My unwanted behavior is skipping breakfast."');
  });

  // Every shape of "not there" collapses to '', because the caller's fallback
  // handles them identically and telling them apart here would only let one of
  // them reach a student as text.
  it('is empty for every kind of absence', () => {
    expect(readSheetValue('', 'utb_stated', 'evidence')).toBe('');
    expect(readSheetValue(null, 'utb_stated', 'evidence')).toBe('');
    expect(readSheetValue('not json', 'utb_stated', 'evidence')).toBe('');
    expect(readSheetValue('{}', 'utb_stated', 'evidence')).toBe('');
    expect(readSheetValue(sheet, 'no_such_check', 'evidence')).toBe('');
    expect(readSheetValue(sheet, 'utb_stated', 'missing_part' as any)).toBe('');
  });

  it('does not confuse a sheet with no verdicts for a broken one', () => {
    expect(readSheetValue(JSON.stringify({ slots: [], verdicts: {} }), 'a', 'evidence')).toBe('');
  });
});

describe('unquote', () => {
  it('drops one layer of straight or curly quotes', () => {
    expect(unquote('"hello"')).toBe('hello');
    expect(unquote('“hello”')).toBe('hello');
    expect(unquote("'hello'")).toBe('hello');
  });

  it('leaves unquoted text and internal quotes alone', () => {
    expect(unquote('hello')).toBe('hello');
    expect(unquote('he said "hi" to me')).toBe('he said "hi" to me');
    // Only the outermost layer: a nested quotation is the author's, not ours.
    expect(unquote('""double""')).toBe('"double"');
  });

  it('does not strip a lone or mismatched mark', () => {
    expect(unquote('"unterminated')).toBe('"unterminated');
    expect(unquote('“mismatched"')).toBe('“mismatched"');
  });
});
