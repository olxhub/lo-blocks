// packages/shared/lib/grading/index.ts
//
// Grading subsystem - aggregation, scoring, and progress tracking.
//
// This module provides tools for:
// - Aggregating correctness across multiple graders
// - Computing numeric scores
// - Formatting scores for display
// - (Future) Progress introspection, weighted grading, adaptive models

export {
  countCorrectness,
  worstCaseCorrectness,
  proportionalCorrectness,
  computeScore,
  formatScore,
} from './aggregators';

// Grading-state read hook — the single read point for grader state
export { useCorrectness, selectGradingState, isImmediateContext } from './useCorrectness';
export type { GraderGradingState } from './useCorrectness';

// Numerical grading
export {
  numericalMatch,
  validateNumericalInput,
  validateNumericalAttributes,
  ratioMatch,
  validateRatioInputs,
} from './numerical';
export type { NumericalMatchOptions } from './numerical';

// Formula grading
export {
  formulaMatch,
  validateFormulaAttributes,
  validateFormulaInput,
} from './formula';
export type { FormulaMatchOptions } from './formula';

// Lazy math engine — grader blueprints pass this as `ensureReady` so mathjs
// loads at first parse/grade of math content, not with the blueprint.
export { ensureCalcLoaded } from './calcLoader';
