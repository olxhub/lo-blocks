/**
 * Recursive tree-walk evaluator for openedx-calc AST nodes.
 * Port of the evaluation logic from calc/calc.py.
 */

import { Complex, add, subtract, multiply, divide, negate, power } from './complex.js';
import { SUFFIXES } from './functions.js';

/**
 * Evaluate an AST node and return a numeric result (number or Complex).
 */
export function evaluate(node, context) {
  switch (node.type) {
    case 'number':
      return evalNumber(node);
    case 'variable':
      return evalVariable(node, context);
    case 'function':
      return evalFunction(node, context);
    case 'parens':
      return evaluate(node.expr, context);
    case 'negate':
      return negate(evaluate(node.expr, context));
    case 'power':
      return evalPower(node, context);
    case 'parallel':
      return evalParallel(node, context);
    case 'product':
      return evalProduct(node, context);
    case 'sum':
      return evalSum(node, context);
    default:
      throw new Error(`Unknown AST node type: ${node.type}`);
  }
}

function evalNumber(node) {
  const raw = node.value;
  if (node.suffix) {
    const numPart = raw.slice(0, -node.suffix.length);
    const func = SUFFIXES[node.suffix];
    return func(parseFloat(numPart));
  }
  if (raw.includes('.') || raw.includes('e') || raw.includes('E')) {
    return parseFloat(raw);
  }
  return parseInt(raw, 10);
}

function evalVariable(node, context) {
  const name = context.casify(node.name);
  return context.variables[name];
}

function evalFunction(node, context) {
  const name = context.casify(node.name);
  const fn = context.functions[name];
  const arg = evaluate(node.arg, context);
  return fn(arg);
}

function evalPower(node, context) {
  const base = evaluate(node.base, context);
  const exp = evaluate(node.exponent, context);
  return power(base, exp);
}

function evalParallel(node, context) {
  const values = node.operands.map(op => evaluate(op, context));
  // Return NaN if any value is 0
  for (const v of values) {
    if (v === 0 || (Complex.isComplex(v) && v.re === 0 && v.im === 0)) {
      return NaN;
    }
  }
  let sumReciprocals = 0;
  for (const v of values) {
    sumReciprocals = add(sumReciprocals, divide(1, v));
  }
  return divide(1, sumReciprocals);
}

function evalProduct(node, context) {
  let result = evaluate(node.head, context);
  for (const { op, right } of node.tail) {
    const rval = evaluate(right, context);
    if (op === '*') {
      result = multiply(result, rval);
    } else {
      // Division - check for zero
      if (typeof rval === 'number' && rval === 0) {
        throw new ZeroDivisionError('division by zero');
      }
      if (Complex.isComplex(rval) && rval.re === 0 && rval.im === 0) {
        throw new ZeroDivisionError('division by zero');
      }
      result = divide(result, rval);
    }
  }
  return result;
}

function evalSum(node, context) {
  let result = evaluate(node.head, context);
  for (const { op, right } of node.tail) {
    const rval = evaluate(right, context);
    if (op === '+') {
      result = add(result, rval);
    } else {
      result = subtract(result, rval);
    }
  }
  return result;
}

class ZeroDivisionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZeroDivisionError';
  }
}

export { ZeroDivisionError };
