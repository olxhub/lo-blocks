// parseSeries turns free-typed number lists into plottable rows, and reports
// what it could not use. The reporting is the point: a series that is blank or
// short still plots cleanly, so without it an omission is invisible to whoever
// is entering the data.

import { describe, it, expect } from 'vitest';
import { parseSeries } from './_SelfMonitorPlot';

const CATS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
const SERIES = ['Series 1', 'Series 2', 'Series 3', 'Series 4'];
const full = '1,2,3,4,5,6,7';

describe('parseSeries: separators', () => {
  it('accepts commas, spaces, semicolons and newlines alike', () => {
    const r = parseSeries(['1 2 3 4 5 6 7', full, '1;2;3;4;5;6;7', '1\n2\n3\n4\n5\n6\n7'],
                          SERIES, CATS);
    expect(r.rows).toHaveLength(28);
    expect(r.rejected).toEqual([]);
    expect(r.incomplete).toEqual([]);
  });

  it('keeps the authored category order rather than sorting', () => {
    const r = parseSeries([full], SERIES, CATS);
    expect(r.rows.map(x => x.category)).toEqual(CATS);
  });
});

describe('parseSeries: unusable tokens', () => {
  it('reports a non-numeric token instead of dropping it silently', () => {
    const r = parseSeries(['1,2,9hours,4,5,6,7'], SERIES, CATS);
    expect(r.rejected).toEqual([{ series: 'Series 1', token: '9hours' }]);
  });

  it('does not count a rejected token toward the series length', () => {
    const r = parseSeries(['1,2,x,4,5,6,7'], SERIES, CATS);
    // six usable values against seven categories
    expect(r.incomplete).toEqual([
      { series: 'Series 1', kind: 'count', got: 6, expected: 7 },
    ]);
  });
});

describe('parseSeries: completeness', () => {
  it('reports a series that is short', () => {
    const r = parseSeries(['1,2,3'], SERIES, CATS);
    expect(r.incomplete).toEqual([
      { series: 'Series 1', kind: 'count', got: 3, expected: 7 },
    ]);
  });

  it('reports a series that is over-long', () => {
    const r = parseSeries(['1,2,3,4,5,6,7,8,9'], SERIES, CATS);
    expect(r.incomplete).toEqual([
      { series: 'Series 1', kind: 'count', got: 9, expected: 7 },
    ]);
  });

  it('reports series left blank when others carry data', () => {
    const r = parseSeries([full, '', '', ''], SERIES, CATS);
    expect(r.incomplete).toEqual([
      { series: 'Series 2', kind: 'empty', got: 0, expected: 7 },
      { series: 'Series 3', kind: 'empty', got: 0, expected: 7 },
      { series: 'Series 4', kind: 'empty', got: 0, expected: 7 },
    ]);
  });

  it('stays quiet on an untouched form, so it does not nag before anyone types', () => {
    expect(parseSeries(['', '', '', ''], SERIES, CATS).incomplete).toEqual([]);
    expect(parseSeries([], SERIES, CATS).incomplete).toEqual([]);
  });

  it('stays quiet when the author gave no categories to compare against', () => {
    const r = parseSeries(['1,2,3'], SERIES, []);
    expect(r.rows).toHaveLength(3);
    expect(r.incomplete).toEqual([]);
  });

  it('treats a series of legitimate zeros as data, not as absence', () => {
    const r = parseSeries(['0,0,0,0,0,0,0', full, full, full], SERIES, CATS);
    expect(r.incomplete).toEqual([]);
  });
});
