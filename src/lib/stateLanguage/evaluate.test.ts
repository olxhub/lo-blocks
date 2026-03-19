// src/lib/stateLanguage/evaluate.test.ts

import { describe, it, expect } from 'vitest';
import { parse } from './parser';
import { evaluate, createContext, wordcount } from './evaluate';

// Import match functions from their pure modules (avoid circular imports)
import { stringMatch } from '@/components/blocks/grading/stringMatch';
import { numericalMatch } from '@/lib/util/numeric';
import { registerDSLFunction } from './functions';

// Register match functions for DSL evaluation
// In production, these are registered by createGrader when grader modules load
registerDSLFunction('stringMatch', stringMatch);
registerDSLFunction('numericalMatch', numericalMatch);

describe('evaluate', () => {
  describe('literals', () => {
    it('evaluates numbers', () => {
      expect(evaluate(parse('42'), createContext())).toBe(42);
      expect(evaluate(parse('3.14'), createContext())).toBe(3.14);
    });

    it('evaluates strings', () => {
      expect(evaluate(parse('"hello"'), createContext())).toBe('hello');
      expect(evaluate(parse("'world'"), createContext())).toBe('world');
    });
  });

  describe('sigil references', () => {
    it('evaluates @ references (componentState)', () => {
      const ctx = createContext({
        componentState: {
          essay: { value: 'my essay text', done: 'done' }
        }
      });
      expect(evaluate(parse('@essay'), ctx)).toEqual({ value: 'my essay text', done: 'done' });
      expect(evaluate(parse('@essay.value'), ctx)).toBe('my essay text');
      expect(evaluate(parse('@essay.done'), ctx)).toBe('done');
    });

    it('evaluates # references (olxContent)', () => {
      const ctx = createContext({
        olxContent: {
          assignment: 'Write about Moby Dick'
        }
      });
      expect(evaluate(parse('#assignment'), ctx)).toBe('Write about Moby Dick');
    });

    it('evaluates $ references (globalVar)', () => {
      const ctx = createContext({
        globalVar: {
          condition: 'treatment'
        }
      });
      expect(evaluate(parse('$condition'), ctx)).toBe('treatment');
    });

    it('returns undefined for missing references', () => {
      const ctx = createContext();
      expect(evaluate(parse('@missing'), ctx)).toBeUndefined();
      expect(evaluate(parse('@missing.field'), ctx)).toBeUndefined();
    });
  });

  describe('built-in constants', () => {
    it('provides completion enum with consistent camelCase values', () => {
      const ctx = createContext();
      // Keys and values use consistent camelCase - no translation layer
      expect(evaluate(parse('completion.done'), ctx)).toBe('done');
      expect(evaluate(parse('completion.notStarted'), ctx)).toBe('notStarted');
      expect(evaluate(parse('completion.inProgress'), ctx)).toBe('inProgress');
      expect(evaluate(parse('completion.skipped'), ctx)).toBe('skipped');
      expect(evaluate(parse('completion.closed'), ctx)).toBe('closed');
    });

    it('provides correctness enum with consistent camelCase values', () => {
      const ctx = createContext();
      // Keys and values use consistent camelCase - no translation layer
      expect(evaluate(parse('correctness.correct'), ctx)).toBe('correct');
      expect(evaluate(parse('correctness.incorrect'), ctx)).toBe('incorrect');
      expect(evaluate(parse('correctness.partiallyCorrect'), ctx)).toBe('partiallyCorrect');
      expect(evaluate(parse('correctness.unsubmitted'), ctx)).toBe('unsubmitted');
      expect(evaluate(parse('correctness.submitted'), ctx)).toBe('submitted');
      expect(evaluate(parse('correctness.incomplete'), ctx)).toBe('incomplete');
      expect(evaluate(parse('correctness.invalid'), ctx)).toBe('invalid');
    });
  });

  describe('comparison operators', () => {
    it('evaluates === and !==', () => {
      const ctx = createContext({
        componentState: { quiz: { correct: 'correct', done: 'DONE' } }
      });
      expect(evaluate(parse('@quiz.correct === correctness.correct'), ctx)).toBe(true);
      expect(evaluate(parse('@quiz.correct === correctness.incorrect'), ctx)).toBe(false);
      expect(evaluate(parse('@quiz.done !== completion.notStarted'), ctx)).toBe(true);
    });

    it('evaluates numeric comparisons', () => {
      const ctx = createContext({
        componentState: { score: { value: 85 } }
      });
      expect(evaluate(parse('@score.value > 80'), ctx)).toBe(true);
      expect(evaluate(parse('@score.value >= 85'), ctx)).toBe(true);
      expect(evaluate(parse('@score.value < 90'), ctx)).toBe(true);
      expect(evaluate(parse('@score.value <= 85'), ctx)).toBe(true);
    });
  });

  describe('logical operators', () => {
    it('evaluates && and ||', () => {
      const ctx = createContext({
        componentState: {
          a: { completion: 'done' },
          b: { completion: 'notStarted' }
        }
      });
      expect(evaluate(parse('@a.completion === completion.done && @b.completion === completion.done'), ctx)).toBe(false);
      expect(evaluate(parse('@a.completion === completion.done || @b.completion === completion.done'), ctx)).toBe(true);
    });

    it('evaluates !', () => {
      const ctx = createContext({
        componentState: { quiz: { correct: 'incorrect' } }
      });
      expect(evaluate(parse('!(@quiz.correct === correctness.correct)'), ctx)).toBe(true);
    });
  });

  describe('arithmetic', () => {
    it('evaluates +, -, *, /', () => {
      const ctx = createContext({
        componentState: { x: { value: 10 }, y: { value: 3 } }
      });
      expect(evaluate(parse('@x.value + @y.value'), ctx)).toBe(13);
      expect(evaluate(parse('@x.value - @y.value'), ctx)).toBe(7);
      expect(evaluate(parse('@x.value * @y.value'), ctx)).toBe(30);
      expect(evaluate(parse('@x.value / 2'), ctx)).toBe(5);
    });
  });

  describe('ternary', () => {
    it('evaluates conditional expressions', () => {
      const ctx = createContext({
        componentState: {
          quiz: { correct: 'correct' }
        }
      });
      expect(evaluate(parse('@quiz.correct === correctness.correct ? "pass" : "fail"'), ctx)).toBe('pass');

      ctx.componentState.quiz.correct = 'incorrect';
      expect(evaluate(parse('@quiz.correct === correctness.correct ? "pass" : "fail"'), ctx)).toBe('fail');
    });
  });

  describe('function calls', () => {
    it('evaluates wordcount', () => {
      const ctx = createContext({
        componentState: {
          essay: { value: 'The quick brown fox jumps over the lazy dog' }
        }
      });
      expect(evaluate(parse('wordcount(@essay.value)'), ctx)).toBe(9);
    });

    it('evaluates Math functions', () => {
      const ctx = createContext({
        componentState: { score: { value: 0.756 } }
      });
      expect(evaluate(parse('Math.round(@score.value * 100)'), ctx)).toBe(76);
      expect(evaluate(parse('Math.floor(@score.value * 10)'), ctx)).toBe(7);
    });
  });

  describe('array methods with arrow functions', () => {
    it('evaluates items.every', () => {
      const ctx = createContext({
        items: [
          { completion: 'done' },
          { completion: 'done' },
          { completion: 'done' }
        ]
      });
      expect(evaluate(parse('items.every(c => c.completion === completion.done)'), ctx)).toBe(true);

      ctx.items[1].completion = 'inProgress';
      expect(evaluate(parse('items.every(c => c.completion === completion.done)'), ctx)).toBe(false);
    });

    it('evaluates items.some', () => {
      const ctx = createContext({
        items: [
          { correct: 'incorrect' },
          { correct: 'correct' },
          { correct: 'incorrect' }
        ]
      });
      expect(evaluate(parse('items.some(c => c.correct === correctness.correct)'), ctx)).toBe(true);
    });

    it('evaluates items.filter().length', () => {
      const ctx = createContext({
        items: [
          { correct: 'correct' },
          { correct: 'incorrect' },
          { correct: 'correct' }
        ]
      });
      expect(evaluate(parse('items.filter(c => c.correct === correctness.correct).length'), ctx)).toBe(2);
    });

    it('evaluates items.length', () => {
      const ctx = createContext({
        items: [1, 2, 3, 4, 5]
      });
      expect(evaluate(parse('items.length'), ctx)).toBe(5);
    });
  });

  describe('template literals', () => {
    it('evaluates template with expressions', () => {
      const ctx = createContext({
        componentState: {
          correct: { value: 3 },
          total: { value: 5 }
        }
      });
      expect(evaluate(parse('`Score: ${@correct.value}/${@total.value}`'), ctx)).toBe('Score: 3/5');
    });
  });

  describe('real-world expressions', () => {
    it('evaluates chat wait condition', () => {
      const ctx = createContext({
        componentState: {
          grader: { correct: 'correct' }
        }
      });
      expect(evaluate(parse('@grader.correct === correctness.correct'), ctx)).toBe(true);
    });

    it('evaluates complex gating condition', () => {
      const ctx = createContext({
        componentState: {
          quiz1: { correct: 'incorrect', completion: 'closed' },
          essay: { completion: 'done' }
        }
      });
      // (@quiz1.correct === correctness.correct || @quiz1.completion === completion.closed) && @essay.completion === completion.done
      const expr = '(@quiz1.correct === correctness.correct || @quiz1.completion === completion.closed) && @essay.completion === completion.done';
      expect(evaluate(parse(expr), ctx)).toBe(true);
    });

    it('evaluates word count threshold', () => {
      const ctx = createContext({
        componentState: {
          essay: { value: 'This is a short essay with exactly ten words here.' }
        }
      });
      expect(evaluate(parse('wordcount(@essay.value) >= 10'), ctx)).toBe(true);
      expect(evaluate(parse('wordcount(@essay.value) >= 100'), ctx)).toBe(false);
    });
  });
});

describe('wordcount helper', () => {
  it('counts words correctly', () => {
    expect(wordcount('hello world')).toBe(2);
    expect(wordcount('  multiple   spaces  ')).toBe(2);
    expect(wordcount('')).toBe(0);
    expect(wordcount(null)).toBe(0);
    expect(wordcount(undefined)).toBe(0);
  });
});

describe('object literals', () => {
  it('evaluates empty object', () => {
    expect(evaluate(parse('{}'), createContext())).toEqual({});
  });

  it('evaluates object with literals', () => {
    expect(evaluate(parse('{ ignoreCase: true }'), createContext())).toEqual({ ignoreCase: true });
    expect(evaluate(parse('{ a: 1, b: 2 }'), createContext())).toEqual({ a: 1, b: 2 });
  });

  it('evaluates object with expressions', () => {
    const ctx = createContext({
      componentState: { x: { value: 42 } }
    });
    expect(evaluate(parse('{ answer: @x.value }'), ctx)).toEqual({ answer: 42 });
  });

  it('evaluates nested objects', () => {
    expect(evaluate(parse('{ outer: { inner: 1 } }'), createContext())).toEqual({ outer: { inner: 1 } });
  });
});

describe('DSL match functions', () => {
  // Note: stringMatch and numericalMatch are registered by their grader modules.
  // These tests verify the function registry lookup works.

  describe('stringMatch', () => {
    it('evaluates exact match', () => {
      const ctx = createContext({
        componentState: { answer: { value: 'Paris' } }
      });
      expect(evaluate(parse('stringMatch(@answer.value, "Paris")'), ctx)).toBe(true);
      expect(evaluate(parse('stringMatch(@answer.value, "London")'), ctx)).toBe(false);
    });

    it('evaluates case-insensitive match with options', () => {
      const ctx = createContext({
        componentState: { answer: { value: 'PARIS' } }
      });
      expect(evaluate(parse('stringMatch(@answer.value, "paris", { ignoreCase: true })'), ctx)).toBe(true);
      expect(evaluate(parse('stringMatch(@answer.value, "paris", { ignoreCase: false })'), ctx)).toBe(false);
    });

    it('evaluates regexp match', () => {
      const ctx = createContext({
        componentState: { answer: { value: 'color' } }
      });
      expect(evaluate(parse('stringMatch(@answer.value, "colou?r", { regexp: true })'), ctx)).toBe(true);
      expect(evaluate(parse('stringMatch("colour", "colou?r", { regexp: true })'), ctx)).toBe(true);
    });

    it('returns false for empty input', () => {
      const ctx = createContext({
        componentState: { answer: { value: '' } }
      });
      expect(evaluate(parse('stringMatch(@answer.value, "anything")'), ctx)).toBe(false);
    });
  });

  describe('numericalMatch', () => {
    it('evaluates exact match', () => {
      const ctx = createContext({
        componentState: { answer: { value: '42' } }
      });
      expect(evaluate(parse('numericalMatch(@answer.value, 42)'), ctx)).toBe(true);
      expect(evaluate(parse('numericalMatch(@answer.value, 43)'), ctx)).toBe(false);
    });

    it('evaluates match with tolerance', () => {
      const ctx = createContext({
        componentState: { answer: { value: '9.85' } }
      });
      expect(evaluate(parse('numericalMatch(@answer.value, 9.8, { tolerance: 0.1 })'), ctx)).toBe(true);
      expect(evaluate(parse('numericalMatch(@answer.value, 9.8, { tolerance: 0.01 })'), ctx)).toBe(false);
    });

    it('returns false for empty input', () => {
      const ctx = createContext({
        componentState: { answer: { value: '' } }
      });
      expect(evaluate(parse('numericalMatch(@answer.value, 42)'), ctx)).toBe(false);
    });

    it('returns false for non-numeric input', () => {
      const ctx = createContext({
        componentState: { answer: { value: 'abc' } }
      });
      expect(evaluate(parse('numericalMatch(@answer.value, 42)'), ctx)).toBe(false);
    });
  });

  describe('match functions in conditions', () => {
    it('works with ternary operator', () => {
      const ctx = createContext({
        componentState: { answer: { value: 'Paris' } }
      });
      expect(evaluate(
        parse('stringMatch(@answer.value, "Paris") ? "Correct!" : "Try again"'),
        ctx
      )).toBe('Correct!');
    });

    it('works with logical operators', () => {
      const ctx = createContext({
        componentState: {
          city: { value: 'Paris' },
          country: { value: 'France' }
        }
      });
      expect(evaluate(
        parse('stringMatch(@city.value, "Paris") && stringMatch(@country.value, "France")'),
        ctx
      )).toBe(true);
    });
  });
});
