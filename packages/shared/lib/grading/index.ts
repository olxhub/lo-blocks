// src/lib/grading/index.ts
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
