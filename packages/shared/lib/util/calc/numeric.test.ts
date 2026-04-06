// @vitest-environment node
// Tests for numerical grading: calc/ parsers + lib/grading/ match functions.
import type { Tolerance } from '@/lib/util/calc/tolerance';
import {
  parseComplex,
  parseTolerance,
  parseRange,
  inRange,
  compareAbsolute,
} from '@/lib/util/calc/index.js';
import {
  numericalMatch,
  validateNumericalInput,
  ratioMatch,
  validateRatioInputs,
  validateNumericalAttributes,
} from '@/lib/grading';

it('parses complex numbers and compares', () => {
  const c1 = parseComplex('3+4i');
  expect(c1.re).toBe(3);
  expect(c1.im).toBe(4);
  const c2 = parseComplex('5j');
  expect(c2.re).toBeCloseTo(0);
  expect(c2.im).toBe(5);
  expect(compareAbsolute('5', '5', 0)).toBe(true);
  expect(compareAbsolute('5', '6', 1)).toBe(true);
});

it('handles ranges', () => {
  const r = parseRange('[1,2)');
  expect(r.lowerInclusive).toBe(true);
  expect(r.upperInclusive).toBe(false);
  expect(inRange('1.5', r, 0)).toBe(true);
  expect(inRange('2', r, 0)).toBe(false);
});

describe('numericalMatch', () => {
  // numericalMatch now returns boolean (pure predicate)
  // The framework handles empty/invalid input before calling match

  it('matches exact values', () => {
    expect(numericalMatch('5', '5')).toBe(true);
    expect(numericalMatch('5', '6')).toBe(false);
  });

  it('matches with tolerance', () => {
    expect(numericalMatch('5.5', '5', { tolerance: '1' as Tolerance })).toBe(true);
    expect(numericalMatch('5.5', '5', { tolerance: '0.1' as Tolerance })).toBe(false);
  });

  it('matches ranges', () => {
    expect(numericalMatch('6', '[5,7)')).toBe(true);
    expect(numericalMatch('7', '[5,7)')).toBe(false);
  });

  // Note: Invalid range formats are caught by validateNumericalAttributes at parse time.
  // By the time match is called, the answer should be valid.
});

describe('validateNumericalInput', () => {
  // Framework calls this before numericalMatch

  it('accepts valid numbers', () => {
    expect(validateNumericalInput('42')).toBeUndefined();
    expect(validateNumericalInput('3.14')).toBeUndefined();
    expect(validateNumericalInput('-5')).toBeUndefined();
    expect(validateNumericalInput('3+4i')).toBeUndefined();
  });

  it('rejects non-numeric input', () => {
    expect(validateNumericalInput('Hello')).toEqual(['Invalid number']);
    expect(validateNumericalInput('abc')).toEqual(['Invalid number']);
  });
});

describe('ratioMatch', () => {
  // ratioMatch returns boolean (pure predicate)
  // The framework handles empty/invalid input before calling match
  // Now expects { numerator, denominator } object from grader framework

  it('matches ratios with object input', () => {
    expect(ratioMatch({ numerator: '1', denominator: '2' }, '0.5')).toBe(true);
    expect(ratioMatch({ numerator: '4', denominator: '8' }, '0.5')).toBe(true);
    expect(ratioMatch({ numerator: '1', denominator: '3' }, '0.5')).toBe(false);
  });

  it('matches with tolerance', () => {
    expect(ratioMatch({ numerator: '2', denominator: '5' }, '0.5', { tolerance: '0.1' as Tolerance })).toBe(true);
    expect(ratioMatch({ numerator: '2', denominator: '5' }, '0.5', { tolerance: '0.01' as Tolerance })).toBe(false);
  });
});

describe('validateRatioInputs', () => {
  // Framework calls this before ratioMatch
  // Now expects { numerator, denominator } object from grader framework

  it('accepts valid ratio inputs', () => {
    expect(validateRatioInputs({ numerator: '1', denominator: '2' })).toBeUndefined();
    expect(validateRatioInputs({ numerator: '4', denominator: '8' })).toBeUndefined();
  });

  it('rejects missing slots', () => {
    expect(validateRatioInputs({ numerator: '1' } as any)).toEqual(['Need two inputs (numerator and denominator)']);
    expect(validateRatioInputs({ denominator: '2' } as any)).toEqual(['Need two inputs (numerator and denominator)']);
  });

  it('rejects invalid numerator', () => {
    expect(validateRatioInputs({ numerator: 'abc', denominator: '2' })).toEqual(['Invalid numerator']);
  });

  it('rejects invalid denominator', () => {
    expect(validateRatioInputs({ numerator: '1', denominator: 'xyz' })).toEqual(['Invalid denominator']);
  });

  it('rejects division by zero', () => {
    expect(validateRatioInputs({ numerator: '1', denominator: '0' })).toEqual(['Division by zero']);
  });
});

describe('validateNumericalAttributes', () => {
  // Validates author's answer/tolerance at parse time

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
    expect(errors![0]).toContain('not a valid non-negative number');
  });

  it('rejects invalid ranges', () => {
    const errors = validateNumericalAttributes({ answer: '[abc, 10]' });
    expect(errors).toBeDefined();
    expect(errors![0]).toContain('Invalid lower bound');
  });
});
