// Grading verdicts about typed data.
//
// Handout 3 asks two different questions of the same four fields: 1b scores a
// point per week of data present, 1c gates on whether there is a graph of the
// student's own at all. The leniency matters and is easy to get backwards — the
// rubric says "Any legible daily figures for a week earn its point... Do not
// deduct for formatting, units, or gaps within a week", so a short or partly
// unreadable week still earns it. The chart warns about those; the score does not
// punish them.

import { describe, it, expect } from 'vitest';
import { completeVerdict, dataVerdict } from './dataVerdict';

const EXAMPLE = [
  [8, 10, 8, 12, 6, 10, 0],
  [32, 20, 22, 28, 30, 32, 10],
  [30, 28, 26, 30, 32, 32, 30],
  [25, 26, 30, 32, 32, 28, 32],
];
const asText = (rows: number[][]) => rows.map(r => r.join(', '));

describe('one week at a time — 1b, a presence check', () => {
  it('earns the point on a full week', () => {
    expect(dataVerdict(['5, 6, 4, 7, 5, 6, 3']).verdict).toBe('met');
  });

  it('earns the point on a SHORT week — gaps are not deducted', () => {
    expect(dataVerdict(['5, 6, 4']).verdict).toBe('met');
  });

  it('earns the point on ONE number', () => {
    expect(dataVerdict(['5']).verdict).toBe('met');
  });

  it('earns the point when some entries are unreadable but one is not', () => {
    expect(dataVerdict(['5, six, seven']).verdict).toBe('met');
  });

  it('accepts spaces and newlines, not just commas', () => {
    expect(dataVerdict(['5 6 4']).verdict).toBe('met');
    expect(dataVerdict(['5\n6\n4']).verdict).toBe('met');
  });

  it('counts zero as data — a missed day is a measurement', () => {
    expect(dataVerdict(['0, 0, 0, 0, 0, 0, 0']).verdict).toBe('met');
  });

  it('loses the point on an empty week', () => {
    expect(dataVerdict(['']).verdict).toBe('absent');
    expect(dataVerdict(['   ']).verdict).toBe('absent');
  });

  it('loses the point when nothing is a number', () => {
    expect(dataVerdict(['I forgot to track this week']).verdict).toBe('absent');
  });

  it('says which case it is, in the singular', () => {
    expect(dataVerdict(['5, 6']).evidence).toContain('2 value(s) entered');
    expect(dataVerdict(['']).evidence).toContain('this week');
  });
});

describe('all four at once — 1c, a gate', () => {
  it('is met on the student\'s own data', () => {
    expect(dataVerdict(asText([[1, 2], [3, 4], [5, 6], [7, 8]])).verdict).toBe('met');
  });

  it('is absent when no field holds a number', () => {
    expect(dataVerdict(['', '', '', '']).verdict).toBe('absent');
  });

  it('is met when only one week was entered — a graph still draws', () => {
    expect(dataVerdict(['1, 2, 3', '', '', '']).verdict).toBe('met');
  });

  it('is a mismatch on the worked example\'s own data', () => {
    expect(dataVerdict(asText(EXAMPLE), EXAMPLE).verdict).toBe('mismatch');
  });

  it('is NOT a mismatch when only one week was copied', () => {
    const partly = asText([EXAMPLE[0], [1, 2, 3, 4, 5, 6, 7], [8], [9]]);
    expect(dataVerdict(partly, EXAMPLE).verdict).toBe('met');
  });

  it('is NOT a mismatch when a copied value was changed', () => {
    const tweaked = EXAMPLE.map((r, i) => (i === 0 ? [99, ...r.slice(1)] : r));
    expect(dataVerdict(asText(tweaked), EXAMPLE).verdict).toBe('met');
  });

  it('ignores the template when none is given', () => {
    expect(dataVerdict(asText(EXAMPLE)).verdict).toBe('met');
  });

  it('reports absent before mismatch — no data cannot be copied data', () => {
    expect(dataVerdict(['', '', '', ''], EXAMPLE).verdict).toBe('absent');
  });
});

describe('completeVerdict — the whole month, for 1c\'s gate', () => {
  const four = (a: string, b: string, c: string, d: string) => [a, b, c, d];
  const full = '1, 2, 3, 4, 5, 6, 7';

  it('is met when every week holds data', () => {
    expect(completeVerdict(four(full, full, full, full)).verdict).toBe('met');
  });

  it('is ABSENT when a week is missing, where dataVerdict would say met', () => {
    const partial = four('', full, full, '');          // p15's shape
    expect(completeVerdict(partial).verdict).toBe('absent');
    expect(dataVerdict(partial).verdict).toBe('met');   // the 1b reading, unchanged
  });

  it('says how many weeks are missing, and what to do', () => {
    const ev = completeVerdict(four('', full, full, '')).evidence;
    expect(ev).toContain('2 of the 4 weeks');
    expect(ev).toContain('all four weeks');
  });

  it('reports no data at all differently from a partial month', () => {
    expect(completeVerdict(four('', '', '', '')).evidence).toContain('no graph is drawn');
    expect(completeVerdict(four('', full, full, full)).evidence).toContain('1 of the 4');
  });

  it('is lenient WITHIN a week — a short week is still a week', () => {
    expect(completeVerdict(four('1, 2', full, full, full)).verdict).toBe('met');
  });

  it('still catches the worked example once the month is complete', () => {
    const EX = [[8,10,8,12,6,10,0],[32,20,22,28,30,32,10],
                [30,28,26,30,32,32,30],[25,26,30,32,32,28,32]];
    const asText = EX.map(r => r.join(', '));
    expect(completeVerdict(asText, EX).verdict).toBe('mismatch');
  });

  it('prefers the incompleteness message over the template one', () => {
    // An incomplete month cannot be the example's data, and saying which weeks are
    // missing is the more useful thing to tell the student.
    const EX = [[8,10,8,12,6,10,0],[32,20,22,28,30,32,10],
                [30,28,26,30,32,32,30],[25,26,30,32,32,28,32]];
    const partial = ['8, 10, 8, 12, 6, 10, 0', '', '', ''];
    expect(completeVerdict(partial, EX).verdict).toBe('absent');
  });
});
