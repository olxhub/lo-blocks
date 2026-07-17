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
  aggregateGradingStates,
} from './aggregators';

// The consumed surface. Pipeline internals (prepareGrade, evaluateGrade,
// buildGraderParam, ...) are exported by their own modules for the grading
// subsystem's cross-module use, not re-exported here — import from
// './pipeline' etc. if you're inside the subsystem, and reconsider if
// you're not.
export { childGraderStateKeys, whenGatedGradingKids } from './topology';
export { grader } from './submitGrade';
export type { GradingState } from './model';

// Grading-state read model — the single read point for grader state
export { selectGradingState } from './selectGradingState';
export { useGradingState } from './useGradingState';
export { registerGradingResolvers } from './registerResolvers';

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
