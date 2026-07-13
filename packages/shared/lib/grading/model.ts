// packages/shared/lib/grading/model.ts
//
// Domain vocabulary for the grading subsystem.
//
// The core representations:
// - GraderInput[]: ONE array of coherent records is the currency of the
//   pipeline — never parallel id/value/api arrays.
// - RawGraderResult vs GradingResult: grade functions may return booleans
//   and loose messages; everything downstream speaks the normalized form.
// - PreparedGrade: everything needed to run a grade, built once by
//   prepareGrade() and consumed identically by submit-mode and
//   immediate-mode evaluation.
//
import type { z } from 'zod';
import type { Correctness } from '../blocks/correctness';
import type { GradingDescriptor, RuntimeProps, StateKey } from '../types';

export type { GradingDescriptor };

/** One resolved grader input: live value, bound API, authoring metadata. */
export interface GraderInput {
  id: StateKey;
  /** Display name for authoring-error messages (block name or tag). */
  name: string;
  value: unknown;
  api: Record<string, (...args: unknown[]) => unknown>;
  /** Explicit slot= attribute, for multi-input graders. */
  slot?: string;
  /** The input block's declared value type. */
  valueSchema?: z.ZodType;
  /** Input commits on change (radio/dropdown) — immediate mode shows
   *  incorrect instantly instead of softening to incomplete. */
  commitOnChange: boolean;
}

// Param shapes a grade function receives — exactly one of these, chosen by
// the descriptor (slots → dict, inputType 'list' → list, default → single).
export type SingleParam = { input: unknown; inputApi: object };
export type ListParam = { inputList: unknown[]; inputApis: object[] };
export type DictParam = { inputDict: Record<string, unknown>; inputApiDict: Record<string, object> };
export type GraderParams = SingleParam | ListParam | DictParam;

/** What a grade function returns. May be a Promise for slow graders.
 *  `correct` accepts booleans and correctness strings; normalizeGraderResult
 *  fail-fast validates anything that isn't a known correctness value. */
export interface RawGraderResult {
  correct: boolean | Correctness | string;
  message?: unknown;
  score?: number;
}
export type GraderFn = (props: RuntimeProps, params: GraderParams) =>
  RawGraderResult | Promise<RawGraderResult>;

/** The normalized grading outcome every consumer speaks. */
export interface GradingResult {
  correct: Correctness;
  message: string;
  score?: number;
}

/** A grader's full observable grading state: outcome plus attempt count. */
export interface GradingState extends GradingResult {
  submitCount: number;
}

/**
 * Everything needed to run a grade. Both execution modes consume this:
 * submit mode awaits ensureReady then evaluates (possibly async);
 * immediate mode evaluates synchronously (the render gate already readied
 * lazy engines — see useBlocksReady).
 */
export interface PreparedGrade {
  /** The grader's own props with its OLX attributes spread in. */
  graderProps: RuntimeProps;
  descriptor: GradingDescriptor;
  inputs: GraderInput[];
  param: GraderParams;
  ensureReady?: () => Promise<void>;
}

/**
 * An authoring/configuration failure (missing slot, incompatible input
 * type, no inputs). Rendered to the learner as correctness.invalid —
 * never thrown; broken runtime invariants throw instead.
 */
export interface GradeError {
  gradeError: string;
}
export function isGradeError(x: unknown): x is GradeError {
  return typeof (x as GradeError)?.gradeError === 'string';
}
