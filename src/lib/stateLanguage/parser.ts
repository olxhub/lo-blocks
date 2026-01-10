// src/lib/stateLanguage/parser.ts
//
// State language expression parser.
// Wraps the PEG-generated parser and provides TypeScript types.

import * as pegParser from './_exprParser.js';

// ============================================
// AST Node Types
// ============================================

export interface SigilRef {
  type: 'SigilRef';
  sigil: '@' | '#' | '$';
  id: string;
  fields: string[];
}

export interface BinaryOp {
  type: 'BinaryOp';
  op: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOp {
  type: 'UnaryOp';
  op: string;
  argument: ASTNode;
}

export interface Ternary {
  type: 'Ternary';
  condition: ASTNode;
  then: ASTNode;
  else: ASTNode;
}

export interface Call {
  type: 'Call';
  callee: ASTNode;
  arguments: ASTNode[];
}

export interface MemberAccess {
  type: 'MemberAccess';
  object: ASTNode;
  property: string;
}

export interface ArrowFunction {
  type: 'ArrowFunction';
  param: string;
  body: ASTNode;
}

export interface NumberLiteral {
  type: 'Number';
  value: number;
}

export interface StringLiteral {
  type: 'String';
  value: string;
}

export interface TemplateLiteral {
  type: 'TemplateLiteral';
  parts: TemplatePart[];
}

export interface TemplateExpr {
  type: 'TemplateExpr';
  expression: ASTNode;
}

export interface TemplateText {
  type: 'TemplateText';
  value: string;
}

export type TemplatePart = TemplateExpr | TemplateText;

export interface Identifier {
  type: 'Identifier';
  name: string;
}

export interface BooleanLiteral {
  type: 'Boolean';
  value: boolean;
}

export interface ObjectLiteral {
  type: 'Object';
  properties: Record<string, ASTNode>;
}

export type ASTNode =
  | SigilRef
  | BinaryOp
  | UnaryOp
  | Ternary
  | Call
  | MemberAccess
  | ArrowFunction
  | NumberLiteral
  | StringLiteral
  | TemplateLiteral
  | Identifier
  | BooleanLiteral
  | ObjectLiteral;

// ============================================
// Parser Functions
// ============================================

/**
 * Parse an expression string into an AST.
 * Throws SyntaxError if the expression is invalid.
 */
export function parse(input: string): ASTNode {
  return pegParser.parse(input);
}

/**
 * Try to parse an expression, returning null on failure.
 */
export function tryParse(input: string): ASTNode | null {
  try {
    return pegParser.parse(input);
  } catch {
    return null;
  }
}

/**
 * Parse an expression and return a result object.
 */
export function parseResult(input: string): { success: true; ast: ASTNode } | { success: false; error: string } {
  try {
    const ast = pegParser.parse(input);
    return { success: true, ast };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
