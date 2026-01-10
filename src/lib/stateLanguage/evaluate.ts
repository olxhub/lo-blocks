// src/lib/stateLanguage/evaluate.ts
//
// Pure AST interpreter for the state language.
// No React, no Redux - just takes an AST and a context object.

import type { ASTNode } from './parser';
import { dslFunctions } from './functions';
import { correctness, completion } from '@/lib/blocks/correctness';

/**
 * Context data for evaluation.
 * The three standard namespaces plus caller-provided bindings.
 */
export interface ContextData {
  componentState: Record<string, any>;
  olxContent: Record<string, string>;
  globalVar: Record<string, any>;
  [binding: string]: any;  // Caller-provided bindings
}

/**
 * Evaluate an AST node with the given context.
 *
 * @param ast - The AST node to evaluate
 * @param context - The context data containing values for references
 * @returns The evaluated result
 */
export function evaluate(ast: ASTNode, context: ContextData): any {
  switch (ast.type) {
    case 'SigilRef':
      return evaluateSigilRef(ast, context);

    case 'Identifier':
      return evaluateIdentifier(ast.name, context);

    case 'Number':
      return ast.value;

    case 'String':
      return ast.value;

    case 'Boolean':
      return ast.value;

    case 'BinaryOp':
      return evaluateBinaryOp(ast, context);

    case 'UnaryOp':
      return evaluateUnaryOp(ast, context);

    case 'Ternary':
      return evaluate(ast.condition, context)
        ? evaluate(ast.then, context)
        : evaluate(ast.else, context);

    case 'MemberAccess':
      return evaluateMemberAccess(ast, context);

    case 'Call':
      return evaluateCall(ast, context);

    case 'ArrowFunction':
      // Return a function that can be called with a value
      return (value: any) => {
        const innerContext = { ...context, [ast.param]: value };
        return evaluate(ast.body, innerContext);
      };

    case 'TemplateLiteral':
      return ast.parts.map(part => {
        if (part.type === 'TemplateText') return part.value;
        if (part.type === 'TemplateExpr') return String(evaluate(part.expression, context));
        return '';
      }).join('');

    case 'Object':
      // Evaluate each property value and build a plain object
      const result: Record<string, any> = {};
      for (const [key, valueAst] of Object.entries(ast.properties)) {
        result[key] = evaluate(valueAst as ASTNode, context);
      }
      return result;

    default:
      throw new Error(`Unknown AST node type: ${(ast as any).type}`);
  }
}

/**
 * Evaluate a sigil reference (@, #, $)
 */
function evaluateSigilRef(
  ast: { sigil: '@' | '#' | '$'; id: string; fields: string[] },
  context: ContextData
): any {
  let value: any;

  switch (ast.sigil) {
    case '@':
      value = context.componentState?.[ast.id];
      break;
    case '#':
      value = context.olxContent?.[ast.id];
      break;
    case '$':
      value = context.globalVar?.[ast.id];
      break;
  }

  // Apply field access chain
  for (const field of ast.fields) {
    if (value == null) return undefined;
    value = value[field];
  }

  return value;
}

/**
 * Evaluate an identifier by looking it up in context.
 * This handles caller-provided bindings and built-in identifiers.
 */
function evaluateIdentifier(name: string, context: ContextData): any {
  // Built-in constants - exported directly from correctness.ts
  if (name === 'completion') return completion;
  if (name === 'correctness') return correctness;

  // Built-in objects
  if (name === 'Math') return Math;
  // HACK: Object.keys() works but is instructor-unfriendly for wait conditions.
  // TODO: Replace with instructor-friendly alternatives, then remove Object:
  //   - isFilled(@value) - generic helper for objects, arrays, strings
  //   - .numberFilled field on TabularMCQ
  //   - tmcqFilled(@tabularMCQ.value) helper function
  // Once we have better options, remove Object to keep the DSL simple.
  if (name === 'Object') return Object;

  // DSL functions from registry (stringMatch, numericalMatch, etc.)
  if (name in dslFunctions) {
    return dslFunctions[name];
  }

  // Look up in context (caller-provided bindings)
  if (name in context) {
    return context[name];
  }

  return undefined;
}

/**
 * Evaluate a binary operation
 */
function evaluateBinaryOp(
  ast: { op: string; left: ASTNode; right: ASTNode },
  context: ContextData
): any {
  const left = evaluate(ast.left, context);
  const right = evaluate(ast.right, context);

  switch (ast.op) {
    // Comparison
    case '===': return left === right;
    case '!==': return left !== right;
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;

    // Logical
    case '&&': return left && right;
    case '||': return left || right;

    // Arithmetic
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return left / right;

    default:
      throw new Error(`Unknown binary operator: ${ast.op}`);
  }
}

/**
 * Evaluate a unary operation
 */
function evaluateUnaryOp(
  ast: { op: string; argument: ASTNode },
  context: ContextData
): any {
  const arg = evaluate(ast.argument, context);

  switch (ast.op) {
    case '!': return !arg;
    default:
      throw new Error(`Unknown unary operator: ${ast.op}`);
  }
}

/**
 * Evaluate member access (obj.prop)
 */
function evaluateMemberAccess(
  ast: { object: ASTNode | string; property: string },
  context: ContextData
): any {
  // Handle string object (from grammar - plain identifiers)
  const obj = typeof ast.object === 'string'
    ? evaluateIdentifier(ast.object, context)
    : evaluate(ast.object, context);

  if (obj == null) return undefined;
  return obj[ast.property];
}

/**
 * Evaluate a function call
 */
function evaluateCall(
  ast: { callee: ASTNode | string; arguments: ASTNode[] },
  context: ContextData
): any {
  const args = ast.arguments.map(arg => evaluate(arg, context));

  // Handle string callee (simple function call like `wordcount(...)`)
  if (typeof ast.callee === 'string') {
    const fn = evaluateIdentifier(ast.callee, context);
    if (typeof fn !== 'function') {
      throw new Error(`Cannot call non-function: ${ast.callee}`);
    }
    return fn(...args);
  }

  // Handle method calls (obj.method(...)) - need to preserve binding
  if (ast.callee.type === 'MemberAccess') {
    const obj = typeof ast.callee.object === 'string'
      ? evaluateIdentifier(ast.callee.object, context)
      : evaluate(ast.callee.object, context);

    if (obj == null) {
      throw new Error(`Cannot access method on null/undefined: ${JSON.stringify(ast.callee)}`);
    }

    const method = obj[ast.callee.property];
    if (typeof method !== 'function') {
      throw new Error(`${ast.callee.property} is not a function`);
    }

    // Call with proper binding
    return method.apply(obj, args);
  }

  // Other callee types
  const callee = evaluate(ast.callee, context);
  if (typeof callee !== 'function') {
    throw new Error(`Cannot call non-function: ${JSON.stringify(ast.callee)}`);
  }
  return callee(...args);
}

// ============================================
// Built-in helper functions
// ============================================

/**
 * Count words in a string
 */
export function wordcount(str: string | null | undefined): number {
  if (!str || typeof str !== 'string') return 0;
  return str.split(/\s+/).filter(Boolean).length;
}

/**
 * Create a context with built-in helpers pre-populated.
 * Caller should spread their data on top of this.
 */
export function createContext(data: Partial<ContextData> = {}): ContextData {
  return {
    componentState: {},
    olxContent: {},
    globalVar: {},
    wordcount,
    ...data
  };
}
