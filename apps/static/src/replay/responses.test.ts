// apps/static/src/replay/responses.test.ts
//
// Tests the pure response-CSV helpers: the RFC-4180 escaper (the whole of our
// CSV correctness) and field extraction from replayed state. No student data —
// synthetic state and a neutral test account only.
//
import { describe, it, expect } from 'vitest';
import { csvParseRows } from 'd3-dsv';

// A real RFC-4180 CSV parser (d3-dsv) — we parse our output back to prove the
// escaper round-trips, catching column-shift bugs on multi-line/quoted text.
const parse = (text: string): string[][] => csvParseRows(text);

import type { AppState } from '@/lib/replay';
import {
  csvEscape,
  csvRow,
  csvDocument,
  extractResponseField,
  extractResponseFields,
  responsesHeader,
  responseRow,
  sessionRows,
  DEFAULT_RESPONSE_FIELDS,
  RESPONSE_META_COLUMNS,
} from './responses';
import type { StudentEntry } from './sessions';

describe('csvEscape', () => {
  it('leaves plain values unquoted', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape('123')).toBe('123');
    expect(csvEscape(42)).toBe('42');
  });

  it('renders null/undefined as empty', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('quotes commas', () => {
    expect(csvEscape('a,b,c')).toBe('"a,b,c"');
  });

  it('quotes newlines (both LF and CRLF)', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"');
  });
});

describe('csvDocument round-trips through a real parser', () => {
  it('parses back to the same rows, even with multi-line / quoted / comma text', () => {
    const header = ['user_id', 'answer'];
    const rows = [
      ['alice', 'plain answer'],
      ['bob', 'multi\nline\nanswer'],
      ['carol', 'has, commas, and "quotes"'],
      ['dave', ''],
    ];
    const doc = csvDocument(header, rows);
    const parsed = parse(doc);

    // header + 4 data rows, no column shift on the multi-line cell.
    expect(parsed).toHaveLength(5);
    expect(parsed[0]).toEqual(header);
    expect(parsed[1]).toEqual(['alice', 'plain answer']);
    expect(parsed[2]).toEqual(['bob', 'multi\nline\nanswer']);
    expect(parsed[3]).toEqual(['carol', 'has, commas, and "quotes"']);
    expect(parsed[4]).toEqual(['dave', '']);
    // Every row has exactly the header's column count.
    for (const r of parsed) expect(r).toHaveLength(header.length);
  });

  it('csvRow escapes each cell', () => {
    expect(csvRow(['a', 'b,c', 'd"e'])).toBe('a,"b,c","d""e"');
  });
});

describe('extractResponseField', () => {
  const state: AppState = {
    component: {
      'CONTENT/initial_suggestion': { value: 'use positive reinforcement', 'value.selectionEnd': 5 },
      'CONTENT/ai_feedback': { value: 'Good, but...\nconsider consistency.' },
      'CONTENT/psych_course': { value: null },
      'CONTENT/some_number': { value: 42 },
    },
    componentSetting: {},
    system: {},
    storage: {},
    olxjson: {},
    chat: {},
  };

  it('reads the .value out of CONTENT/<field>', () => {
    expect(extractResponseField(state, 'initial_suggestion')).toBe('use positive reinforcement');
  });

  it('preserves multi-line text verbatim', () => {
    expect(extractResponseField(state, 'ai_feedback')).toBe('Good, but...\nconsider consistency.');
  });

  it('returns empty string for a missing component (never reached)', () => {
    expect(extractResponseField(state, 'never_touched')).toBe('');
  });

  it('returns empty string for a null value', () => {
    expect(extractResponseField(state, 'psych_course')).toBe('');
  });

  it('stringifies non-string values', () => {
    expect(extractResponseField(state, 'some_number')).toBe('42');
  });

  it('extractResponseFields keeps order and length', () => {
    const out = extractResponseFields(state, ['initial_suggestion', 'never_touched', 'ai_feedback']);
    expect(out).toEqual(['use positive reinforcement', '', 'Good, but...\nconsider consistency.']);
  });
});

describe('row builders', () => {
  const student: StudentEntry = {
    safeUserId: 'nginx-testuser',
    userId: 'testuser',
    sessions: [
      {
        id: 's1', started: '2026-07-01T13:00:00.000Z', ended: '2026-07-01T13:30:00.000Z',
        durationMs: 30 * 60000, activeMs: 12 * 60000, eventCount: 100, baselineEventCount: 0, gaps: [{ afterEventIndex: 5, durationMs: 180000 }],
      },
      {
        id: 's2', started: '2026-07-02T09:00:00.000Z', ended: '2026-07-02T09:10:00.000Z',
        durationMs: 10 * 60000, activeMs: 6 * 60000, eventCount: 40, baselineEventCount: 100, gaps: [],
      },
    ],
    totalEventCount: 140,
    totalDurationMs: 40 * 60000,
    totalActiveMs: 18 * 60000,
    lastActive: '2026-07-02T09:10:00.000Z',
  };

  const state: AppState = {
    component: { 'CONTENT/initial_suggestion': { value: 'hi' } },
    componentSetting: {}, system: {}, storage: {}, olxjson: {}, chat: {},
  };

  it('responsesHeader has meta columns then fields', () => {
    const h = responsesHeader(['a', 'b']);
    expect(h.slice(0, RESPONSE_META_COLUMNS.length)).toEqual([...RESPONSE_META_COLUMNS]);
    expect(h.slice(RESPONSE_META_COLUMNS.length)).toEqual(['a', 'b']);
  });

  it('responseRow packs identity, rounded active minutes, ISO date, then fields', () => {
    const row = responseRow(student, state, ['initial_suggestion', 'ai_feedback']);
    expect(row[0]).toBe('testuser');           // user_id
    expect(row[1]).toBe('nginx-testuser');     // safe_user_id
    expect(row[2]).toBe(2);                    // sessions
    expect(row[3]).toBe(18);                   // total_active_min
    expect(row[4]).toBe('2026-07-02');         // last_active (date only)
    expect(row[5]).toBe('hi');                 // initial_suggestion
    expect(row[6]).toBe('');                   // ai_feedback (missing -> empty)
  });

  it('sessionRows emits one row per session with rounded minutes and pause count', () => {
    const rows = sessionRows(student);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['nginx-testuser', '2026-07-01T13:00:00.000Z', 30, 12, 100, 1]);
    expect(rows[1]).toEqual(['nginx-testuser', '2026-07-02T09:00:00.000Z', 10, 6, 40, 0]);
  });

  it('a full responses.csv parses back with correct shape', () => {
    const fields = [...DEFAULT_RESPONSE_FIELDS];
    const doc = csvDocument(responsesHeader(fields), [responseRow(student, state, fields)]);
    const parsed = parse(doc);
    expect(parsed).toHaveLength(2); // header + 1 student
    const cols = RESPONSE_META_COLUMNS.length + fields.length;
    expect(parsed[0]).toHaveLength(cols);
    expect(parsed[1]).toHaveLength(cols);
  });
});
