// packages/shared/lib/util/calc/types.ts
//
// Type definitions for the calc library.
//
// AST node types match what grammar.pegjs produces.
// SamplesSpec describes the variable sampling hypercube for formula grading.
// validateTolerance is shared across graders (formula, numerical, ratio).

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
// Shared Validators
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate a tolerance attribute string.
 * Accepts absolute numbers ("0.01"), percentages ("5%"), and empty/undefined.
 * Returns an error message or undefined if valid.
 *
 * Used by both FormulaGrader and NumericalGrader attribute validation.
 */
export function validateTolerance(tolerance: any): string | undefined {
  if (tolerance === undefined || tolerance === '') return undefined;
  const s = String(tolerance).trim();
  if (s.endsWith('%')) {
    const p = parseFloat(s.slice(0, -1));
    if (isNaN(p)) return `tolerance: "${tolerance}" is not a valid percentage.`;
    return undefined;
  }
  const n = parseFloat(s);
  if (isNaN(n) || n < 0) return `tolerance: "${tolerance}" is not a valid non-negative number.`;
  return undefined;
}
