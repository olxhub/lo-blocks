// packages/shared/lib/grading/calc/types.ts
//
// Type definitions for the calc library.
//
// AST node types match what grammar.pegjs produces.
// SamplesSpec describes the variable sampling hypercube for formula grading.

// ═══════════════════════════════════════════════════════════════════════
// AST Node Types
// ═══════════════════════════════════════════════════════════════════════
//
// Discriminated union on `type`. Matches the grammar output exactly.
// See grammar.pegjs for the production rules.

export interface NumberNode {
  type: 'number';
  /** Raw numeric string including suffix, e.g. "3.14" or "4.2%" */
  value: string;
  /** Suffix like "%" or null */
  suffix: string | null;
}

export interface VariableNode {
  type: 'variable';
  /** Variable name, possibly with tensor subscripts/superscripts and primes, e.g. "x", "T_{ij}^{12}''" */
  name: string;
}

export interface FunctionNode {
  type: 'function';
  name: string;
  arg: CalcASTNode;
}

export interface ParensNode {
  type: 'parens';
  expr: CalcASTNode;
}

export interface NegateNode {
  type: 'negate';
  expr: CalcASTNode;
}

export interface PowerNode {
  type: 'power';
  base: CalcASTNode;
  exponent: CalcASTNode;
}

export interface ParallelNode {
  type: 'parallel';
  operands: CalcASTNode[];
}

export interface ProductNode {
  type: 'product';
  head: CalcASTNode;
  tail: { op: '*' | '/'; right: CalcASTNode }[];
}

export interface SumNode {
  type: 'sum';
  head: CalcASTNode;
  tail: { op: '+' | '-'; right: CalcASTNode }[];
}

export type CalcASTNode =
  | NumberNode
  | VariableNode
  | FunctionNode
  | ParensNode
  | NegateNode
  | PowerNode
  | ParallelNode
  | ProductNode
  | SumNode;

// ═══════════════════════════════════════════════════════════════════════
// Samples Specification
// ═══════════════════════════════════════════════════════════════════════
//
// Parsed form of a samples string like "x,y@-5,-10:5,10#11".
// Defines the hypercube of random sample points for formula grading.

export interface SamplesSpec {
  variables: string[];
  ranges: Record<string, [min: number, max: number]>;
  numSamples: number;
}

// ═══════════════════════════════════════════════════════════════════════
// Complex Number — Module augmentation
// ═══════════════════════════════════════════════════════════════════════
//
// HACK: mathjs's TypeScript declarations export Complex as a minimal
// interface (re, im, clone, equals). At runtime it's the full complex.js
// class with arithmetic methods. We augment the interface here.
//
// Remove this when either:
// - mathjs ships complete Complex typings, or
// - we migrate to math.add/math.subtract/etc. functional API (preferred)

declare module 'mathjs' {
  interface Complex {
    abs(): number;
    neg(): Complex;
    add(other: Complex | number): Complex;
    sub(other: Complex | number): Complex;
    mul(other: Complex | number): Complex;
    div(other: Complex | number): Complex;
    pow(other: Complex | number): Complex;
    sin(): Complex;
    cos(): Complex;
    asin(): Complex;
    acos(): Complex;
    log(): Complex;
  }
}
