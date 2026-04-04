/**
 * Tests for formula grading utilities (formulaMatch, validateFormulaAttributes, validateFormulaInput).
 */

import { describe, it, expect } from 'vitest';
import { formulaMatch, validateFormulaAttributes, validateFormulaInput } from './formula';
import { validateTolerance } from './calc/types';

// Seeded RNG for deterministic tests
function seededRng(seed = 42) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ============================================================
// validateTolerance (shared)
// ============================================================

describe('validateTolerance', () => {
  it('accepts valid absolute tolerance', () => {
    expect(validateTolerance('0.01')).toBeUndefined();
    expect(validateTolerance('0')).toBeUndefined();
    expect(validateTolerance('100')).toBeUndefined();
  });

  it('accepts valid percentage tolerance', () => {
    expect(validateTolerance('5%')).toBeUndefined();
    expect(validateTolerance('0.1%')).toBeUndefined();
  });

  it('accepts undefined and empty', () => {
    expect(validateTolerance(undefined)).toBeUndefined();
    expect(validateTolerance('')).toBeUndefined();
  });

  it('rejects negative numbers', () => {
    expect(validateTolerance('-1')).toMatch(/non-negative/);
  });

  it('rejects non-numeric strings', () => {
    expect(validateTolerance('abc')).toMatch(/non-negative/);
  });

  it('rejects invalid percentage', () => {
    expect(validateTolerance('abc%')).toMatch(/percentage/);
  });
});

// ============================================================
// formulaMatch
// ============================================================

describe('formulaMatch', () => {
  it('recognizes equivalent formulas', () => {
    expect(formulaMatch('(x-1)*(x+1)', 'x^2 - 1', { samples: 'x@-5:5#10' })).toBe(true);
  });

  it('rejects non-equivalent formulas', () => {
    expect(formulaMatch('x^3', 'x^2', { samples: 'x@1:5#10' })).toBe(false);
  });

  it('handles multiple variables', () => {
    expect(formulaMatch('2*x*y', 'x*y + y*x', { samples: 'x,y@-10,-10:10,10#15' })).toBe(true);
  });

  it('throws without samples', () => {
    expect(() => formulaMatch('x', 'x', {})).toThrow(/samples/);
  });

  it('respects caseSensitive option', () => {
    // With caseSensitive=true, 'X' and 'x' are different variables
    expect(formulaMatch('X', 'x', { samples: 'x,X@-5,-5:5,5#10', caseSensitive: 'true' })).toBe(false);
  });

  it('accepts additionalAnswers', () => {
    // Primary answer doesn't match, but additional does
    expect(formulaMatch('x+1', 'x^2', { samples: 'x@1:5#10', additionalAnswers: '1+x' })).toBe(true);
  });

  it('rejects when no answers match', () => {
    expect(formulaMatch('x^3', 'x^2', { samples: 'x@1:5#10', additionalAnswers: 'x^4' })).toBe(false);
  });
});

// ============================================================
// validateFormulaAttributes
// ============================================================

describe('validateFormulaAttributes', () => {
  it('accepts valid attributes', () => {
    expect(validateFormulaAttributes({
      answer: 'x^2 + 1',
      samples: 'x@-5:5#10',
    })).toBeUndefined();
  });

  it('reports bad tolerance', () => {
    const errors = validateFormulaAttributes({
      answer: 'x',
      samples: 'x@-5:5#10',
      tolerance: 'abc',
    });
    expect(errors).toBeDefined();
    expect(errors!.some(e => e.includes('tolerance'))).toBe(true);
  });

  it('reports unparseable answer', () => {
    const errors = validateFormulaAttributes({
      answer: 'x^+',
      samples: 'x@-5:5#10',
    });
    expect(errors).toBeDefined();
    expect(errors!.some(e => e.includes('Could not parse'))).toBe(true);
  });

  it('suggests samples spec when missing', () => {
    const errors = validateFormulaAttributes({
      answer: 'x + y',
    });
    expect(errors).toBeDefined();
    expect(errors![0]).toMatch(/samples is required/);
    expect(errors![0]).toMatch(/x,y@/); // concrete suggestion
  });

  it('reports missing samples for constant answer', () => {
    const errors = validateFormulaAttributes({
      answer: '42',
    });
    expect(errors).toBeDefined();
    expect(errors![0]).toMatch(/samples is required/);
  });

  it('reports bad samples format', () => {
    const errors = validateFormulaAttributes({
      answer: 'x',
      samples: 'bad',
    });
    expect(errors).toBeDefined();
    expect(errors!.some(e => e.includes('@'))).toBe(true);
  });

  it('catches answer variable not in samples', () => {
    const errors = validateFormulaAttributes({
      answer: 'x + y',
      samples: 'x@-5:5#10',
    });
    expect(errors).toBeDefined();
    expect(errors!.some(e => e.includes('"y"') && e.includes('not listed'))).toBe(true);
  });

  it('catches sample variable not in answer', () => {
    const errors = validateFormulaAttributes({
      answer: 'x',
      samples: 'x,y@-5,-5:5,5#10',
    });
    expect(errors).toBeDefined();
    expect(errors!.some(e => e.includes('"y"') && e.includes('does not appear'))).toBe(true);
  });

  it('handles case-insensitive cross-validation', () => {
    // answer uses "X", samples uses "x" — should be fine in case-insensitive mode
    expect(validateFormulaAttributes({
      answer: 'X + 1',
      samples: 'x@-5:5#10',
    })).toBeUndefined();
  });

  it('handles case-sensitive cross-validation', () => {
    // With caseSensitive=true, "X" and "x" are different
    const errors = validateFormulaAttributes({
      answer: 'X + 1',
      samples: 'x@-5:5#10',
      caseSensitive: 'true',
    });
    expect(errors).toBeDefined();
    expect(errors!.some(e => e.includes('"X"'))).toBe(true);
  });

  it('catches formula evaluation failure', () => {
    // sqrt(x) with x sampled from negative range — midpoint is negative
    const errors = validateFormulaAttributes({
      answer: '1/(x-1)',
      samples: 'x@0.5:1.5#10', // midpoint is x=1, which causes division by zero
    });
    expect(errors).toBeDefined();
    expect(errors!.some(e => e.includes('evaluation failed'))).toBe(true);
  });

  it('validates additionalAnswers', () => {
    const errors = validateFormulaAttributes({
      answer: 'x',
      samples: 'x@-5:5#10',
      additionalAnswers: 'x^+', // bad syntax
    });
    expect(errors).toBeDefined();
    expect(errors!.some(e => e.includes('additionalAnswers'))).toBe(true);
  });
});

// ============================================================
// validateFormulaInput
// ============================================================

describe('validateFormulaInput', () => {
  it('accepts valid expression', () => {
    expect(validateFormulaInput('x^2 + 1', { samples: 'x@-5:5#10' })).toBeUndefined();
  });

  it('rejects non-string', () => {
    expect(validateFormulaInput(42, {})).toEqual(['Expected a string']);
  });

  it('reports syntax errors', () => {
    const errors = validateFormulaInput('x^+', { samples: 'x@-5:5#10' });
    expect(errors).toBeDefined();
  });

  it('reports unmatched parentheses', () => {
    const errors = validateFormulaInput('(x+1', { samples: 'x@-5:5#10' });
    expect(errors).toBeDefined();
    expect(errors![0]).toMatch(/parenthes/i);
  });

  it('catches undefined variables when checkVariables enabled', () => {
    const errors = validateFormulaInput('x + y', { samples: 'x@-5:5#10' });
    expect(errors).toBeDefined();
    expect(errors![0]).toMatch(/y/);
  });

  it('allows any variables when checkVariables="false"', () => {
    expect(validateFormulaInput('x + y + z', {
      samples: 'x@-5:5#10',
      checkVariables: 'false',
    })).toBeUndefined();
  });

  it('tolerates division by zero (expression parsed fine)', () => {
    expect(validateFormulaInput('1/0', { samples: 'x@-5:5#10' })).toBeUndefined();
  });
});
