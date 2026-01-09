// @vitest-environment node
// src/lib/util/numeric.test.ts
import { parseComplex, parseTolerance, parseRange, inRange, compareWithTolerance, numericalMatch, gradeRatio, validateNumericalAttributes } from './numeric';
import { CORRECTNESS } from '../blocks/correctness';

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

describe('numericalMatch', () => {
  it('matches exact values', () => {
    expect(numericalMatch('5', '5')).toEqual({ state: 'match' });
    expect(numericalMatch('5', '6')).toEqual({ state: 'no_match' });
  });

  it('matches with tolerance', () => {
    expect(numericalMatch('5.5', '5', { tolerance: '1' })).toEqual({ state: 'match' });
    expect(numericalMatch('5.5', '5', { tolerance: '0.1' })).toEqual({ state: 'no_match' });
  });

  it('matches ranges', () => {
    expect(numericalMatch('6', '[5,7)')).toEqual({ state: 'match' });
    expect(numericalMatch('7', '[5,7)')).toEqual({ state: 'no_match' });
  });

  it('returns unsubmitted for empty input', () => {
    expect(numericalMatch('', '5')).toEqual({ state: 'unsubmitted' });
    expect(numericalMatch(null, '5')).toEqual({ state: 'unsubmitted' });
    expect(numericalMatch(undefined, '5')).toEqual({ state: 'unsubmitted' });
  });

  it('returns invalid for non-numeric input', () => {
    expect(numericalMatch('Hello', '5')).toEqual({ state: 'invalid', message: 'Invalid number' });
  });
});

it('grades ratios of two numbers', () => {
  expect(gradeRatio({answer:'0.5'}, {inputs:['1', '2']}).correct).toBe(CORRECTNESS.CORRECT);
  expect(gradeRatio({answer:'0.5', tolerance:'0.1'}, {inputs:['2', '5']}).correct).toBe(CORRECTNESS.CORRECT);
  expect(gradeRatio({answer:'2'}, {inputs:['1', '0']}).correct).toBe(CORRECTNESS.INVALID);
  expect(gradeRatio({answer:'0.5'}, {inputs:['1', '3']}).correct).toBe(CORRECTNESS.INCORRECT);
});

describe('validateNumericalAttributes', () => {
  it('accepts valid numbers', () => {
    expect(validateNumericalAttributes({ answer: '42' })).toBeUndefined();
    expect(validateNumericalAttributes({ answer: '3.14' })).toBeUndefined();
    expect(validateNumericalAttributes({ answer: '-5' })).toBeUndefined();
    expect(validateNumericalAttributes({ answer: '3+4i' })).toBeUndefined();
  });

  it('accepts valid ranges', () => {
    expect(validateNumericalAttributes({ answer: '[0, 10]' })).toBeUndefined();
    expect(validateNumericalAttributes({ answer: '(0, 10)' })).toBeUndefined();
    expect(validateNumericalAttributes({ answer: '[0.5, 1.5]' })).toBeUndefined();
  });

  it('accepts valid tolerances', () => {
    expect(validateNumericalAttributes({ answer: '42', tolerance: '0.1' })).toBeUndefined();
    expect(validateNumericalAttributes({ answer: '42', tolerance: '5%' })).toBeUndefined();
  });

  it('rejects invalid answers', () => {
    const errors = validateNumericalAttributes({ answer: 'Bob is great!' });
    expect(errors).toBeDefined();
    expect(errors![0]).toContain('not a valid number');
  });

  it('rejects invalid tolerances', () => {
    const errors = validateNumericalAttributes({ answer: '42', tolerance: 'abc' });
    expect(errors).toBeDefined();
    expect(errors![0]).toContain('not a valid tolerance');
  });

  it('rejects invalid ranges', () => {
    const errors = validateNumericalAttributes({ answer: '[abc, 10]' });
    expect(errors).toBeDefined();
    expect(errors![0]).toContain('Invalid lower bound');
  });
});
