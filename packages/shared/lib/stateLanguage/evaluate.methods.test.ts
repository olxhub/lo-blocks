// packages/shared/lib/stateLanguage/evaluate.methods.test.ts
//
// The expression language's member vocabulary (methods.ts): what a value's
// properties and methods are, and — the point of the table — what they are
// not. The evaluator used to resolve `obj.prop` and `obj.method(...)`
// straight onto the underlying JavaScript value, so every function-valued
// property of every value was reachable and `"x".constructor.constructor`
// gave out the Function constructor.

import { describe, it, expect } from 'vitest';
import { parse } from './parser';
import { evaluate, createContext } from './evaluate';
import { ACTIVE_METHODS, RESERVED_KEYWORDS } from './keywords';
import { ACTIVE_MEMBER_NAMES } from './methods';

const ev = (expr: string, data: Record<string, any> = {}) =>
  evaluate(parse(expr), createContext(data));

describe('member table — no JS escapes', () => {
  it('refuses the Function-constructor chain', () => {
    expect(() => ev('"x".constructor.constructor("return 1")()')).toThrow(/constructor/);
  });

  it('refuses .constructor on a string', () => {
    expect(() => ev('"x".constructor')).toThrow(/constructor/);
  });

  it('refuses .constructor through a sigil field chain', () => {
    const data = { componentState: { x: { value: 'hello' } } };
    expect(() => ev('@x.value.constructor', data)).toThrow(/constructor/);
    expect(() => ev('@x.value.constructor.constructor("return 1")()', data)).toThrow();
  });

  it('refuses __proto__ and prototype everywhere', () => {
    expect(() => ev('"x".__proto__')).toThrow(/__proto__/);
    expect(() => ev('items.prototype', { items: [1, 2] })).toThrow(/prototype/);
    expect(() => ev('obj.__proto__', { obj: { a: 1 } })).toThrow(/__proto__/);
  });

  it('does not reach inherited properties of a plain object', () => {
    expect(ev('obj.toString', { obj: { a: 1 } })).toBeUndefined();
    expect(ev('obj.hasOwnProperty', { obj: { a: 1 } })).toBeUndefined();
    expect(() => ev('obj.toString()', { obj: { a: 1 } })).toThrow(/no methods/);
  });

  it('does not call a function stored in a plain object', () => {
    expect(() => ev('helpers.boom()', { helpers: { boom: () => 'ran' } }))
      .toThrow(/no methods/);
  });

  it('refuses methods that are only in JS, not in the language', () => {
    expect(() => ev('items.reduce(x => x)', { items: [1, 2] }))
      .toThrow(/Unknown method 'reduce' on arrays/);
    expect(() => ev('"abc".toUpperCase()')).toThrow(/Unknown method 'toUpperCase' on strings/);
  });

  it('names the receiver kind and the member in the error', () => {
    expect(() => ev('items.nope', { items: [1, 2] }))
      .toThrow(/Unknown property 'nope' on arrays/);
    expect(() => ev('"abc".nope')).toThrow(/Unknown property 'nope' on strings/);
    expect(() => ev('n.nope', { n: 3 })).toThrow(/Unknown property 'nope' on numbers/);
    expect(() => ev('Math.tan(1)')).toThrow(/Unknown method 'tan' on the Math namespace/);
  });

  it('asks for a call when a method is read as a property', () => {
    expect(() => ev('items.filter', { items: [1, 2] }))
      .toThrow(/'filter' is a method of arrays/);
  });
});

describe('member table — arrays', () => {
  // Array literals are not in the grammar; lists arrive through the context,
  // as the caller-provided target lists in real content do.
  const items = [
    { id: 'a', n: 1, correct: 'correct' },
    { id: 'b', n: 2, correct: 'incorrect' },
    { id: 'c', n: 3, correct: 'correct' },
  ];
  const ctx = { items, nums: [1, 2], strs: ['a', 'b', 'c'] };

  it('map', () => {
    expect(ev('nums.map(x => x * 2)', ctx)).toEqual([2, 4]);
    expect(ev('items.map(c => c.id)', ctx)).toEqual(['a', 'b', 'c']);
  });

  it('filter, some, every, find', () => {
    expect(ev('items.filter(c => c.correct === correctness.correct).length', ctx)).toBe(2);
    expect(ev('items.some(c => c.n > 2)', ctx)).toBe(true);
    expect(ev('items.every(c => c.n > 0)', ctx)).toBe(true);
    expect(ev('items.find(c => c.id === "b").n', ctx)).toBe(2);
  });

  it('includes and join', () => {
    expect(ev('strs.includes("b")', ctx)).toBe(true);
    expect(ev('strs.includes("z")', ctx)).toBe(false);
    expect(ev('strs.join(", ")', ctx)).toBe('a, b, c');
    expect(ev('strs.join()', ctx)).toBe('a,b,c');
  });

  it('length', () => {
    expect(ev('items.length', ctx)).toBe(3);
    expect(ev('nums.length', ctx)).toBe(2);
  });

  it('arrow-function arguments see only the element', () => {
    // JS would pass (element, index, array); the language promises one
    // parameter, so a second one is never bound.
    expect(ev('nums.map(x => x)', ctx)).toEqual([1, 2]);
  });

  it('rejects a non-function where a callback belongs', () => {
    expect(() => ev('nums.filter(3)', ctx)).toThrow(/needs a function argument/);
  });
});

describe('member table — strings', () => {
  it('length and includes', () => {
    expect(ev('"hello".length')).toBe(5);
    expect(ev('@x.value.length', { componentState: { x: { value: 'hello' } } })).toBe(5);
    expect(ev('"hello".includes("ell")')).toBe(true);
  });
});

describe('member table — namespaces', () => {
  it('Math', () => {
    expect(ev('Math.round(2.6)')).toBe(3);
    expect(ev('Math.floor(2.6)')).toBe(2);
    expect(ev('Math.ceil(2.1)')).toBe(3);
    expect(ev('Math.min(3, 1)')).toBe(1);
    expect(ev('Math.max(3, 1)')).toBe(3);
  });

  it('Object.keys, and .length on the result', () => {
    const ctx = { componentState: { board: { value: { a: 1, b: 2 } } } };
    expect(ev('Object.keys(@board.value)', ctx)).toEqual(['a', 'b']);
    expect(ev('Object.keys(@board.value).length >= 1', ctx)).toBe(true);
  });

  it('a namespace is not the JS global', () => {
    expect(() => ev('Math.constructor')).toThrow(/constructor/);
    expect(() => ev('Object.getPrototypeOf(obj)', { obj: {} }))
      .toThrow(/Unknown method 'getPrototypeOf' on the Object namespace/);
  });
});

describe('member table — plain objects', () => {
  it('reads own enumerable keys', () => {
    expect(ev('{a: 1}.a')).toBe(1);
    expect(ev('obj.missing', { obj: { a: 1 } })).toBeUndefined();
  });

  it('an object literal does not carry Object.prototype', () => {
    expect(ev('{a: 1}.toString')).toBeUndefined();
    expect(() => ev('{a: 1}.constructor')).toThrow(/constructor/);
  });

  it('reads the built-in constant namespaces', () => {
    expect(ev('correctness.correct')).toBe('correct');
    expect(ev('completion.done')).toBe('done');
  });
});

describe('vocabulary is defined once', () => {
  it('ACTIVE_METHODS is the member table\'s value vocabulary', () => {
    expect(ACTIVE_METHODS).toBe(ACTIVE_MEMBER_NAMES);
    expect([...ACTIVE_METHODS].sort()).toEqual(
      ['every', 'filter', 'find', 'includes', 'join', 'length', 'map', 'some']
    );
  });

  it('every active name is reserved against block field names', () => {
    for (const name of ACTIVE_METHODS) {
      expect(RESERVED_KEYWORDS.has(name)).toBe(true);
    }
  });
});
