/**
 * Tests for calc library: evaluator, LaTeX preview, and formula grader.
 * Merged from test-evaluator.js, test-latex.js, and test-grader.js.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluator, latexPreview, LatexRendered,
  UndefinedVariable, UnmatchedParenthesis, Complex,
} from './index.js';
import { checkFormula, parseSamples } from './grader.js';

// ============================================================
// Helpers
// ============================================================

function easyEval(expr) {
  return evaluator({}, {}, expr);
}

function assertClose(actual, expected, delta = 1e-3) {
  if (Complex.isComplex(expected)) {
    const a = Complex.isComplex(actual) ? actual : new Complex(actual, 0);
    expect(Math.abs(a.re - expected.re)).toBeLessThan(delta);
    expect(Math.abs(a.im - expected.im)).toBeLessThan(delta);
  } else if (Complex.isComplex(actual)) {
    expect(Math.abs(actual.re - expected)).toBeLessThan(delta);
    expect(Math.abs(actual.im)).toBeLessThan(delta);
  } else {
    expect(Math.abs(actual - expected)).toBeLessThan(delta);
  }
}

function assertFunctionValues(fname, ins, outs, tolerance = 1e-3) {
  for (let i = 0; i < ins.length; i++) {
    const arg = ins[i];
    const expected = outs[i];
    const expr = `${fname}(${arg})`;
    const result = evaluator({}, {}, expr);
    assertClose(result, expected, tolerance);
  }
}

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
// Evaluator Tests
// ============================================================

describe('EvaluatorTest', () => {
  describe('number input', () => {
    it('should parse integers and floats', () => {
      expect(easyEval('13')).toBe(13);
      expect(easyEval('3.14')).toBe(3.14);
      expect(easyEval('.618033989')).toBeCloseTo(0.618033989);

      expect(easyEval('-13')).toBe(-13);
      expect(easyEval('-3.14')).toBe(-3.14);
      expect(easyEval('-.618033989')).toBeCloseTo(-0.618033989);
    });
  });

  describe('period', () => {
    it('should reject lone period', () => {
      expect(() => easyEval('.')).toThrow();
      expect(() => easyEval('1+.')).toThrow();
    });
  });

  describe('trailing period', () => {
    it('should handle 4. as 4.0', () => {
      expect(easyEval('4.')).toBe(4.0);
    });
  });

  describe('exponential notation', () => {
    it('should parse scientific notation', () => {
      const correct = ['50', '50.0', '5e1', '5e+1', '50e0', '50.0e0', '500e-1'];
      for (const input of correct) {
        expect(easyEval(input)).toBe(50);
      }
      const incorrect = ['', '3.9', '4.1', '0', '5.01e1'];
      for (const input of incorrect) {
        expect(easyEval(input)).not.toBe(50);
      }
    });
  });

  describe('SI suffix', () => {
    it('should handle % suffix', () => {
      const tests = [
        ['4.2%', 0.042],
        ['1%', 0.01],
        ['0.5%', 0.005],
        ['70%', 0.7],
        ['-50%', -0.5],
      ];
      for (const [expr, expected] of tests) {
        assertClose(easyEval(expr), expected, Math.abs(expected * 1e-6));
      }
    });
  });

  describe('operator sanity', () => {
    it('should handle basic operators', () => {
      const ops = [['+', 7], ['-', 3], ['*', 10], ['/', 2.5], ['^', 25]];
      for (const [op, expected] of ops) {
        expect(easyEval(`5.0 ${op} 2.0`)).toBe(expected);
      }
    });
  });

  describe('division by zero', () => {
    it('should throw on division by zero', () => {
      expect(() => easyEval('1/0')).toThrow();
      expect(() => easyEval('1/0.0')).toThrow();
      expect(() => evaluator({ x: 0.0 }, {}, '1/x')).toThrow();
    });
  });

  describe('parallel resistors', () => {
    it('should compute parallel resistance', () => {
      expect(easyEval('1||1')).toBe(0.5);
      assertClose(easyEval('1||1||2'), 0.4);
      assertClose(easyEval('j||1'), new Complex(0.5, 0.5));
    });

    it('should return NaN with zero', () => {
      expect(isNaN(easyEval('0||1'))).toBe(true);
      expect(isNaN(easyEval('0.0||1'))).toBe(true);
      expect(isNaN(evaluator({ x: 0.0 }, {}, 'x||1'))).toBe(true);
    });
  });

  describe('trig functions', () => {
    it('should compute sin/cos/tan', () => {
      const angles = ['-pi/4', '0', 'pi/6', 'pi/5', '5*pi/4', '9*pi/4', '1 + j'];
      const sinVals = [-0.707, 0, 0.5, 0.588, -0.707, 0.707, new Complex(1.298, 0.635)];
      const cosVals = [0.707, 1, 0.866, 0.809, -0.707, 0.707, new Complex(0.834, -0.989)];
      const tanVals = [-1, 0, 0.577, 0.727, 1, 1, new Complex(0.272, 1.084)];

      assertFunctionValues('sin', angles, sinVals);
      assertFunctionValues('cos', angles, cosVals);
      assertFunctionValues('tan', angles, tanVals);
    });

    it('should compute arcsin/arccos/arctan', () => {
      const arcsinInputs = ['-0.707', '0', '0.5', '0.588', '1.298 + 0.635*j', '-1.1', '1.1'];
      const arcsinAngles = [-0.785, 0, 0.524, 0.629, new Complex(1, 1), new Complex(-1.570, 0.443), new Complex(1.570, 0.443)];
      assertFunctionValues('arcsin', arcsinInputs, arcsinAngles);

      const arccosInputs = ['1', '0.866', '0.809', '0.834-0.989*j', '-1.1', '1.1'];
      const arccosAngles = [0, 0.524, 0.628, new Complex(1, 1), new Complex(3.141, -0.443), new Complex(0, -0.443)];
      assertFunctionValues('arccos', arccosInputs, arccosAngles);

      const arctanInputs = ['-1', '0', '0.577', '0.727', '0.272 + 1.084*j'];
      assertFunctionValues('arctan', arctanInputs, arcsinAngles);
    });
  });

  describe('reciprocal trig functions', () => {
    it('should compute sec/csc/cot', () => {
      const angles = ['-pi/4', 'pi/6', 'pi/5', '5*pi/4', '9*pi/4', '1 + j'];
      const secVals = [1.414, 1.155, 1.236, -1.414, 1.414, new Complex(0.498, 0.591)];
      const cscVals = [-1.414, 2, 1.701, -1.414, 1.414, new Complex(0.622, -0.304)];
      const cotVals = [-1, 1.732, 1.376, 1, 1, new Complex(0.218, -0.868)];

      assertFunctionValues('sec', angles, secVals);
      assertFunctionValues('csc', angles, cscVals);
      assertFunctionValues('cot', angles, cotVals);
    });

    it('should compute arcsec/arccsc/arccot', () => {
      const arcsecInputs = ['1.1547', '1.2361', '2', '-2', '-1.4142', '0.4983+0.5911*j'];
      const arcsecAngles = [0.524, 0.628, 1.047, 2.094, 2.356, new Complex(1, 1)];
      assertFunctionValues('arcsec', arcsecInputs, arcsecAngles);

      const arccscInputs = ['-1.1547', '-1.4142', '2', '1.7013', '1.1547', '0.6215-0.3039*j'];
      const arccscAngles = [-1.047, -0.785, 0.524, 0.628, 1.047, new Complex(1, 1)];
      assertFunctionValues('arccsc', arccscInputs, arccscAngles);

      const arccotInputs = ['-0.5774', '-1', '1.7321', '1.3764', '0.5774', '(0.2176-0.868*j)'];
      assertFunctionValues('arccot', arccotInputs, arccscAngles);
    });
  });

  describe('hyperbolic functions', () => {
    it('should compute sinh/cosh/tanh/sech', () => {
      const inputs = ['0', '0.5', '1', '2', '1+j'];
      const negInputs = ['0', '-0.5', '-1', '-2', '-1-j'];
      const neg = vals => vals.map(v => Complex.isComplex(v) ? v.neg() : -v);

      const sinhVals = [0, 0.521, 1.175, 3.627, new Complex(0.635, 1.298)];
      assertFunctionValues('sinh', inputs, sinhVals);
      assertFunctionValues('sinh', negInputs, neg(sinhVals));

      const coshVals = [1, 1.128, 1.543, 3.762, new Complex(0.834, 0.989)];
      assertFunctionValues('cosh', inputs, coshVals);
      assertFunctionValues('cosh', negInputs, coshVals);

      const tanhVals = [0, 0.462, 0.762, 0.964, new Complex(1.084, 0.272)];
      assertFunctionValues('tanh', inputs, tanhVals);
      assertFunctionValues('tanh', negInputs, neg(tanhVals));

      const sechVals = [1, 0.887, 0.648, 0.266, new Complex(0.498, -0.591)];
      assertFunctionValues('sech', inputs, sechVals);
      assertFunctionValues('sech', negInputs, sechVals);
    });

    it('should compute csch/coth', () => {
      const inputs = ['0.5', '1', '2', '1+j'];
      const negInputs = ['-0.5', '-1', '-2', '-1-j'];
      const neg = vals => vals.map(v => Complex.isComplex(v) ? v.neg() : -v);

      const cschVals = [1.919, 0.851, 0.276, new Complex(0.304, -0.622)];
      assertFunctionValues('csch', inputs, cschVals);
      assertFunctionValues('csch', negInputs, neg(cschVals));

      const cothVals = [2.164, 1.313, 1.037, new Complex(0.868, -0.218)];
      assertFunctionValues('coth', inputs, cothVals);
      assertFunctionValues('coth', negInputs, neg(cothVals));
    });
  });

  describe('hyperbolic inverses', () => {
    it('should compute inverse hyperbolic functions', () => {
      const results = [0, 0.5, 1, 2, new Complex(1, 1)];

      const sinhVals = ['0', '0.5211', '1.1752', '3.6269', '0.635+1.2985*j'];
      assertFunctionValues('arcsinh', sinhVals, results);

      const coshVals = ['1', '1.1276', '1.5431', '3.7622', '0.8337+0.9889*j'];
      assertFunctionValues('arccosh', coshVals, results);

      const tanhVals = ['0', '0.4621', '0.7616', '0.964', '1.0839+0.2718*j'];
      assertFunctionValues('arctanh', tanhVals, results);

      const sechVals = ['1.0', '0.8868', '0.6481', '0.2658', '0.4983-0.5911*j'];
      assertFunctionValues('arcsech', sechVals, results);

      const results2 = results.slice(1);
      const cschVals = ['1.919', '0.8509', '0.2757', '0.3039-0.6215*j'];
      assertFunctionValues('arccsch', cschVals, results2);

      const cothVals = ['2.164', '1.313', '1.0373', '0.868-0.2176*j'];
      assertFunctionValues('arccoth', cothVals, results2);
    });
  });

  describe('other functions', () => {
    it('should compute sqrt', () => {
      assertFunctionValues('sqrt', [0, 1, 2, 1024], [0, 1, 1.414, 32]);
    });

    it('should compute log functions', () => {
      assertFunctionValues('log10', [0.1, 1, 3.162, 1000000, '1+j'], [-1, 0, 0.5, 6, new Complex(0.151, 0.341)]);
      assertFunctionValues('log2', [0.5, 1, 1.414, 1024, '1+j'], [-1, 0, 0.5, 10, new Complex(0.5, 1.133)]);
      assertFunctionValues('ln', [0.368, 1, 1.649, 2.718, 42, '1+j'], [-1, 0, 0.5, 1, 3.738, new Complex(0.347, 0.785)]);
    });

    it('should compute abs', () => {
      assertFunctionValues('abs', [-1, 0, 1, 'j'], [1, 0, 1, 1]);
    });

    it('should compute factorial', () => {
      assertFunctionValues('fact', [0, 1, 3, 7], [1, 1, 6, 5040]);
      assertFunctionValues('factorial', [0, 1, 3, 7], [1, 1, 6, 5040]);

      expect(() => easyEval('fact(-1)')).toThrow();
      expect(() => easyEval('fact(0.5)')).toThrow();
      expect(() => easyEval('factorial(-1)')).toThrow();
      expect(() => easyEval('factorial(0.5)')).toThrow();
    });
  });

  describe('constants', () => {
    it('should have correct default constants', () => {
      const i = easyEval('i');
      expect(Complex.isComplex(i)).toBe(true);
      expect(i.re).toBe(0);
      expect(i.im).toBe(1);

      const j = easyEval('j');
      expect(Complex.isComplex(j)).toBe(true);
      expect(j.re).toBe(0);
      expect(j.im).toBe(1);

      assertClose(easyEval('e'), 2.7183, 1e-4);
      assertClose(easyEval('pi'), 3.1416, 1e-4);
    });
  });

  describe('complex expressions', () => {
    it('should evaluate compound expressions', () => {
      assertClose(easyEval('(2^2+1.0)/sqrt(5e0)*5-1'), 10.180);
      assertClose(easyEval('1+1/(1+1/(1+1/(1+1)))'), 1.6);
      assertClose(easyEval('10||sin(7+5)'), -0.567, 0.01);
      assertClose(easyEval('sin(e)'), 0.41, 0.01);
      assertClose(easyEval('e^(j*pi)'), -1, 1e-5);
    });
  });

  describe('explicit scientific notation', () => {
    it('should handle 1.6*10^-3 form', () => {
      expect(easyEval('-1.6*10^-3')).toBeCloseTo(-0.0016);
      expect(easyEval('-1.6*10^(-3)')).toBeCloseTo(-0.0016);
      expect(easyEval('-1.6*10^3')).toBeCloseTo(-1600);
      expect(easyEval('-1.6*10^(3)')).toBeCloseTo(-1600);
    });
  });

  describe('variables', () => {
    it('should substitute variables', () => {
      const variables = { x: 9.72, y: 7.91, loooooong: 6.4, "f_0'": 2.0, "T_{ijk}^{123}''": 5.2 };

      expect(evaluator({ x: 9.72 }, {}, '13')).toBe(13);
      expect(evaluator(variables, {}, '13')).toBe(13);
      expect(evaluator(variables, {}, 'x')).toBe(9.72);
      expect(evaluator(variables, {}, 'y')).toBe(7.91);
      expect(evaluator(variables, {}, 'loooooong')).toBe(6.4);
      expect(evaluator(variables, {}, "f_0'")).toBe(2.0);
      expect(evaluator(variables, {}, "T_{ijk}^{123}''")).toBe(5.2);

      assertClose(evaluator(variables, {}, '3*x-y'), 21.25, 0.01);
      assertClose(evaluator(variables, {}, 'x*y'), 76.89, 0.01);
    });
  });

  describe('variable case sensitivity', () => {
    it('should be case insensitive by default', () => {
      expect(evaluator({ R1: 2.0, R3: 4.0 }, {}, 'r1*r3')).toBe(8.0);
    });

    it('should distinguish case when caseSensitive=true', () => {
      expect(evaluator({ E: 1.0 }, {}, 'E', { caseSensitive: true })).toBe(1.0);
      assertClose(evaluator({ E: 1.0 }, {}, 'e', { caseSensitive: true }), 2.718, 0.02);
    });
  });

  describe('custom functions', () => {
    it('should substitute custom functions', () => {
      const id = (x) => x;
      expect(evaluator({}, { id }, 'id(2.81)')).toBe(2.81);
      expect(evaluator({ x: 4.712 }, { id }, 'id(x)')).toBe(4.712);

      assertClose(evaluator({ x: 4.712 }, { f: Math.sin }, 'f(x)'), -1);
    });
  });

  describe('function case sensitivity', () => {
    it('should be case insensitive by default', () => {
      assertClose(evaluator({}, {}, 'SiN(6)', { caseSensitive: false }), -0.28);
    });

    it('should reject wrong case when caseSensitive=true', () => {
      expect(() => evaluator({}, {}, 'SiN(6)', { caseSensitive: true }))
        .toThrow(UndefinedVariable);
    });

    it('should pick the correct function with case sensitivity', () => {
      const funcs = { f: (x) => x, F: (x) => x + 1 };
      expect(evaluator({}, funcs, 'f(6)', { caseSensitive: true })).toBe(6);
      expect(evaluator({}, funcs, 'F(6)', { caseSensitive: true })).toBe(7);
    });
  });

  describe('undefined variables', () => {
    it('should catch undefined variables', () => {
      expect(() => easyEval('5+7*QWSEKO')).toThrow(/QWSEKO/);
      expect(() => evaluator({ r1: 5 }, {}, 'r1+r2')).toThrow(/r2/);
      expect(() => evaluator({ R1: 2.0, R3: 4.0 }, {}, 'r1*r3', { caseSensitive: true }))
        .toThrow(/r1, r3/);
      expect(() => evaluator({ R1: 2.0, R3: 4.0 }, {}, 'R1(R3 + 1)'))
        .toThrow(/did you forget to use \*/);
    });
  });

  describe('mismatched parentheses', () => {
    it('should catch unmatched parentheses', () => {
      expect(() => easyEval('(1+2')).toThrow(/opened but never closed/);
      expect(() => easyEval('(1+2))')).toThrow(/no matching opening parenthesis/);
    });
  });
});

// ============================================================
// LaTeX Preview Tests
// ============================================================

describe('LatexRendered', () => {
  it('should store data without changing', () => {
    const obj = new LatexRendered('x^2', { tall: true });
    expect(obj.latex).toBe('x^2');
    expect(obj.sans_parens).toBe('x^2');
    expect(obj.tall).toBe(true);
  });

  it('should wrap with curvy parens', () => {
    const obj = new LatexRendered('x+y', { parens: '(' });
    expect(obj.latex).toBe('(x+y)');
    expect(obj.sans_parens).toBe('x+y');
  });

  it('should wrap with brackets', () => {
    const obj = new LatexRendered('x+y', { parens: '[' });
    expect(obj.latex).toBe('[x+y]');
    expect(obj.sans_parens).toBe('x+y');
  });

  it('should wrap with curly braces', () => {
    const obj = new LatexRendered('x+y', { parens: '{' });
    expect(obj.latex).toBe('\\{x+y\\}');
    expect(obj.sans_parens).toBe('x+y');
  });

  it('should use \\left \\right when tall', () => {
    const obj = new LatexRendered('x^y', { parens: '(', tall: true });
    expect(obj.latex).toBe('\\left(x^y\\right)');
    expect(obj.sans_parens).toBe('x^y');
  });

  it('should use \\left \\right brackets when tall', () => {
    const obj = new LatexRendered('x^y', { parens: '[', tall: true });
    expect(obj.latex).toBe('\\left[x^y\\right]');
  });

  it('should use \\left \\right curly braces when tall', () => {
    const obj = new LatexRendered('x^y', { parens: '{', tall: true });
    expect(obj.latex).toBe('\\left\\{x^y\\right\\}');
  });

  it('should throw on invalid parens', () => {
    expect(() => new LatexRendered('x^2', { parens: 'not parens' })).toThrow(/Unknown parenthesis/);
  });
});

describe('latexPreview', () => {
  it('should return empty for no input', () => {
    expect(latexPreview('')).toBe('');
    expect(latexPreview('  ')).toBe('');
    expect(latexPreview(' \t ')).toBe('');
  });

  it('should pass through simple numbers', () => {
    expect(latexPreview('3.1415')).toBe('3.1415');
  });

  it('should escape suffixes', () => {
    expect(latexPreview('1.618%')).toBe('1.618\\text{%}');
  });

  it('should display scientific notation nicely', () => {
    expect(latexPreview('6.0221413E+23')).toBe('6.0221413\\!\\times\\!10^{+23}');
    expect(latexPreview('-6.0221413E+23')).toBe('-6.0221413\\!\\times\\!10^{+23}');
  });

  it('should pass through simple variables', () => {
    expect(latexPreview('x', { variables: ['x'] })).toBe('x');
  });

  it('should format greek letters', () => {
    expect(latexPreview('pi')).toBe('\\pi');
  });

  it('should display subscripts nicely', () => {
    expect(latexPreview('epsilon_max', { variables: ['epsilon_max'] }))
      .toBe('\\epsilon_{max}');
  });

  it('should escape function names', () => {
    expect(latexPreview('f(3)', { functions: ['f'] })).toBe('\\text{f}(3)');
  });

  it('should use \\left \\right for tall function args', () => {
    expect(latexPreview('f(3^2)', { functions: ['f'] }))
      .toBe('\\text{f}\\left(3^{2}\\right)');
  });

  it('should handle sqrt specially', () => {
    expect(latexPreview('sqrt(3)')).toBe('\\sqrt{3}');
  });

  it('should handle log10 specially', () => {
    expect(latexPreview('log10(3)')).toBe('\\log_{10}(3)');
  });

  it('should handle log2 specially', () => {
    expect(latexPreview('log2(3)')).toBe('\\log_2(3)');
  });

  it('should format powers correctly', () => {
    expect(latexPreview('2^3^4')).toBe('2^{3^{4}}');
  });

  it('should strip outer parens from power exponent', () => {
    expect(latexPreview('2^3^(4+5)')).toBe('2^{3^{4+5}}');
  });

  it('should format parallel with \\|', () => {
    expect(latexPreview('2||3')).toBe('2\\|3');
  });

  it('should format multiplication with \\cdot', () => {
    expect(latexPreview('2*3')).toBe('2\\cdot 3');
  });

  it('should format division as \\frac', () => {
    expect(latexPreview('2*3/4/5')).toBe('\\frac{2\\cdot 3}{4\\cdot 5}');
  });

  it('should strip extraneous parens in fractions', () => {
    expect(latexPreview('(2+3)/(4+5)')).toBe('\\frac{2+3}{4+5}');
  });

  it('should split complex products into multiple fracs', () => {
    expect(latexPreview('2/3*4/5*6'))
      .toBe('\\frac{2}{3}\\cdot \\frac{4}{5}\\cdot 6');
  });

  it('should format sums', () => {
    expect(latexPreview('-x+2-3+4', { variables: ['x'] })).toBe('-x+2-3+4');
  });

  it('should propagate tallness in sums', () => {
    expect(latexPreview('(2+3^2)')).toBe('\\left(2+3^{2}\\right)');
  });

  it('should handle complicated expressions', () => {
    expect(latexPreview('11*f(x)+x^2*(3||4)/sqrt(pi)'))
      .toBe('11\\cdot \\text{f}(x)+\\frac{x^{2}\\cdot (3\\|4)}{\\sqrt{\\pi}}');
  });

  it('should handle complicated case-sensitive expression', () => {
    expect(latexPreview('log10(1+3/4/Cos(x^2)*(x+1))', { caseSensitive: true }))
      .toBe('\\log_{10}\\left(1+\\frac{3}{4\\cdot \\text{Cos}\\left(x^{2}\\right)}\\cdot (x+1)\\right)');
  });

  it('should reject bad syntax', () => {
    const badMath = ['11+', '11*', 'f((x)', 'sqrt(x^)', '3f(x)', '3|4', '3|||4'];
    for (const math of badMath) {
      expect(() => latexPreview(math), `Expected '${math}' to throw`).toThrow();
    }
  });
});

// ============================================================
// Grader Tests
// ============================================================

describe('parseSamples', () => {
  it('parses single variable spec', () => {
    const s = parseSamples('x@-5:5#11');
    expect(s.variables).toEqual(['x']);
    expect(s.ranges.x).toEqual([-5, 5]);
    expect(s.numSamples).toBe(11);
  });

  it('parses multi-variable spec', () => {
    const s = parseSamples('x,y@-10,0:10,20#5');
    expect(s.variables).toEqual(['x', 'y']);
    expect(s.ranges.x).toEqual([-10, 10]);
    expect(s.ranges.y).toEqual([0, 20]);
    expect(s.numSamples).toBe(5);
  });
});

describe('checkFormula', () => {
  const rng = seededRng();

  it('recognizes equivalent formulas', () => {
    const result = checkFormula('x^2 - 1', '(x-1)*(x+1)', 'x@-5:5#10', { rng });
    expect(result.correct).toBe(true);
    expect(result.error).toBeNull();
  });

  it('rejects non-equivalent formulas', () => {
    const result = checkFormula('x^2', 'x^3', 'x@1:5#10', { rng: seededRng() });
    expect(result.correct).toBe(false);
  });

  it('handles multiple variables', () => {
    const result = checkFormula(
      'x*y + y*x', '2*x*y',
      'x,y@-10,-10:10,10#15',
      { rng: seededRng() }
    );
    expect(result.correct).toBe(true);
  });

  it('returns error for invalid student input', () => {
    const result = checkFormula('x^2', 'x^2 +', 'x@-5:5#5', { rng: seededRng() });
    expect(result.correct).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
