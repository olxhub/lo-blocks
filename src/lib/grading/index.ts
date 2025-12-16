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
