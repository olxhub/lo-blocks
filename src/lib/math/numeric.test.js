import { parseComplex, parseTolerance, parseRange, inRange, compareWithTolerance, gradeNumerical } from './numeric.js';

it('parses complex numbers and compares', () => {
  expect(parseComplex('3+4i').toString()).toBe('3 + 4i');
  expect(parseComplex('5j').toString()).toBe('5i');
  expect(compareWithTolerance('5', '5', 0)).toBe(true);
  expect(compareWithTolerance('5', '6', 1)).toBe(true);
});

it('handles ranges', () => {
  const r = parseRange('[1,2)');
  expect(r.lowerInclusive).toBe(true);
  expect(r.upperInclusive).toBe(false);
  expect(inRange('1.5', r, 0)).toBe(true);
  expect(inRange('2', r, 0)).toBe(false);
});

it('grades numerical answers with tolerance', () => {
  expect(gradeNumerical({answer:'5'}, '5')).toBe(true);
  expect(gradeNumerical({answer:'5', tolerance:'1'}, '5.5')).toBe(true);
  expect(gradeNumerical({answer:'[5,7)'} , '6')).toBe(true);
  expect(gradeNumerical({answer:'[5,7)'}, '7')).toBe(false);
});
