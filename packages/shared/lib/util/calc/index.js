/**
 * openedx-calc: Math expression parser, evaluator, and LaTeX renderer.
 *
 * Port of the Python openedx-calc library using Peggy.js for parsing
 * and KaTeX for rendering.
 */

import { parse } from './_grammarParser.js';
import { evaluate, ZeroDivisionError } from './evaluator.js';
import { renderLatex, LatexRendered } from './latex.js';
import { DEFAULT_FUNCTIONS, DEFAULT_VARIABLES, SUFFIXES, ValueError } from './functions.js';
import { Complex, isComplex, coerce } from './complex.js';

export class UndefinedVariable extends Error {
  constructor(message) {
    super(message);
    this.name = 'UndefinedVariable';
  }
}

export class UnmatchedParenthesis extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnmatchedParenthesis';
  }
}

function lowerDict(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k.toLowerCase()] = v;
  }
  return result;
}

function checkParens(formula) {
  let count = 0;
  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (ch === '(') count++;
    else if (ch === ')') {
      count--;
      if (count < 0) {
        throw new UnmatchedParenthesis(
          `Invalid Input: A closing parenthesis was found after segment ` +
          `${formula.slice(0, i)}, but there is no matching opening parenthesis before it.`
        );
      }
    }
  }
  if (count > 0) {
    throw new UnmatchedParenthesis(
      `Invalid Input: Parentheses are unmatched. ` +
      `${count} parentheses were opened but never closed.`
    );
  }
}

function collectIdentifiers(ast) {
  const variables = new Set();
  const functions = new Set();

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'variable') variables.add(node.name);
    if (node.type === 'function') {
      functions.add(node.name);
      walk(node.arg);
    }
    if (node.type === 'parens' || node.type === 'negate') walk(node.expr);
    if (node.type === 'power') { walk(node.base); walk(node.exponent); }
    if (node.type === 'sum' || node.type === 'product') {
      walk(node.head);
      if (node.tail) node.tail.forEach(t => walk(t.right));
    }
    if (node.type === 'parallel') node.operands.forEach(walk);
  }

  walk(ast);
  return { variables, functions };
}

/**
 * Translate a raw PEG SyntaxError into a human-friendly message.
 */
function friendlyParseError(expr, pegError) {
  const loc = pegError.location?.start;
  const col = loc ? loc.column - 1 : 0; // PEG columns are 1-based
  const found = pegError.found;

  if (!found) {
    // Unexpected end of input — usually a trailing operator
    const trimmed = expr.trimEnd();
    const lastChar = trimmed[trimmed.length - 1];
    if ('+-*/^'.includes(lastChar)) {
      return `Your expression is incomplete — it ends with "${lastChar}" which needs something after it.`;
    }
    return 'Your expression appears incomplete.';
  }

  // Show a short window around the error location
  const start = Math.max(0, col - 4);
  const end = Math.min(expr.length, col + 6);
  const nearby = expr.substring(start, end).trim();
  return `Could not understand your expression near "${nearby}" (position ${col + 1}).`;
}

function checkVariables(ast, allVariables, allFunctions, caseSensitive) {
  const casify = caseSensitive ? (x => x) : (x => x.toLowerCase());
  const { variables, functions } = collectIdentifiers(ast);

  const badVars = [...variables].filter(v => !(casify(v) in allVariables));
  if (badVars.length > 0) {
    let message = `Invalid Input: ${badVars.sort().join(', ')} not permitted in answer as a variable`;

    // If a "variable" is actually a function name, suggest parentheses
    const funcLike = badVars.filter(v => casify(v) in allFunctions);
    if (funcLike.length > 0) {
      message += ` (functions require parentheses, e.g., ${funcLike[0]}(x) not ${funcLike[0]} x)`;
    } else if (caseSensitive) {
      const caselist = new Set();
      for (const bv of badVars) {
        for (const v of Object.keys(allVariables)) {
          if (bv.toLowerCase() === v.toLowerCase()) caselist.add(v);
        }
      }
      if (caselist.size > 0) {
        message += ` (did you mean ${[...caselist].sort().join(', ')}?)`;
      }
    }
    throw new UndefinedVariable(message);
  }

  const badFuncs = [...functions].filter(f => !(casify(f) in allFunctions));
  if (badFuncs.length > 0) {
    let message = `Invalid Input: ${badFuncs.sort().join(', ')} not permitted in answer as a function`;

    if (badFuncs.some(f => casify(f) in allVariables)) {
      message += ' (did you forget to use * for multiplication?)';
    }

    if (caseSensitive) {
      const caselist = new Set();
      for (const bf of badFuncs) {
        for (const f of Object.keys(allFunctions)) {
          if (bf.toLowerCase() === f.toLowerCase()) caselist.add(f);
        }
      }
      if (caselist.size > 0) {
        message += ` (did you mean ${[...caselist].sort().join(', ')}?)`;
      }
    }
    throw new UndefinedVariable(message);
  }
}

/**
 * Evaluate a math expression string and return a numeric result.
 *
 * @param {Object} variables - Map of variable names to numeric values
 * @param {Object} functions - Map of function names to callables
 * @param {string} mathExpr - The expression to evaluate
 * @param {Object} [options]
 * @param {boolean} [options.caseSensitive=false]
 * @returns {number|Complex} The computed value
 */
export function evaluator(variables, functions, mathExpr, { caseSensitive = false } = {}) {
  if (mathExpr.trim() === '') return NaN;

  checkParens(mathExpr);

  let ast;
  try {
    ast = parse(mathExpr);
  } catch (e) {
    if (e.name === 'SyntaxError' && e.location) {
      const msg = friendlyParseError(mathExpr, e);
      const err = new Error(msg);
      err.name = 'SyntaxError';
      throw err;
    }
    throw e;
  }

  let allVariables = { ...DEFAULT_VARIABLES, ...variables };
  let allFunctions = { ...DEFAULT_FUNCTIONS, ...functions };

  if (!caseSensitive) {
    allVariables = lowerDict(allVariables);
    allFunctions = lowerDict(allFunctions);
  }

  checkVariables(ast, allVariables, allFunctions, caseSensitive);

  const casify = caseSensitive ? (x => x) : (x => x.toLowerCase());
  const context = { variables: allVariables, functions: allFunctions, casify };

  return evaluate(ast, context);
}

/**
 * Convert a math expression string into a LaTeX string.
 *
 * @param {string} mathExpr
 * @param {Object} [options]
 * @param {string[]} [options.variables=[]]
 * @param {string[]} [options.functions=[]]
 * @param {boolean} [options.caseSensitive=false]
 * @returns {string} LaTeX markup
 */
export function latexPreview(mathExpr, { variables = [], functions = [], caseSensitive = false } = {}) {
  if (mathExpr.trim() === '') return '';

  let ast;
  try {
    ast = parse(mathExpr);
  } catch (e) {
    if (e.name === 'SyntaxError' && e.location) {
      const msg = friendlyParseError(mathExpr, e);
      const err = new Error(msg);
      err.name = 'SyntaxError';
      throw err;
    }
    throw e;
  }

  const varSet = new Set([...Object.keys(DEFAULT_VARIABLES), ...variables]);
  const funcSet = new Set([...Object.keys(DEFAULT_FUNCTIONS), ...functions]);

  if (!caseSensitive) {
    const lowerVars = new Set();
    varSet.forEach(v => lowerVars.add(v.toLowerCase()));
    const lowerFuncs = new Set();
    funcSet.forEach(f => lowerFuncs.add(f.toLowerCase()));
    const casify = x => x.toLowerCase();
    const ctx = { variables: lowerVars, functions: lowerFuncs, casify };
    return renderLatex(ast, ctx).latex;
  }

  const casify = x => x;
  const ctx = { variables: varSet, functions: funcSet, casify };
  return renderLatex(ast, ctx).latex;
}

/**
 * Render a math expression to a KaTeX HTML string.
 *
 * @param {string} mathExpr
 * @param {Object} [options] - Same as latexPreview options, plus katexOptions
 * @returns {string} HTML string
 */
export function renderMath(mathExpr, options = {}) {
  const latex = latexPreview(mathExpr, options);
  let katex;
  try {
    katex = globalThis.katex || (typeof require !== 'undefined' && require('katex'));
  } catch (e) {
    throw new Error('KaTeX is required for renderMath(). Install it with: npm install katex');
  }
  if (!katex) {
    throw new Error('KaTeX is required for renderMath(). Install it with: npm install katex');
  }
  return katex.renderToString(latex, { throwOnError: false, ...options.katexOptions });
}

export { parse, Complex, isComplex, coerce, LatexRendered, ZeroDivisionError, ValueError, collectIdentifiers };
export { DEFAULT_FUNCTIONS, DEFAULT_VARIABLES, SUFFIXES };

// Re-export from typed modules
export { parseComplex, parseRange, validateNumber, validateRange, validateFormula, inRange } from './parse';
export { parseTolerance, validateTolerance, compareAbsolute, compareRelative, ToleranceSchema } from './tolerance';
export { checkFormula, parseSamples, validateSamplesSpec, SamplesSpecSchema } from './formula';
