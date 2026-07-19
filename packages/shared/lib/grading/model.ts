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
import type {
  AsyncGraderFn, DictParam, GraderFn, GraderParams, GradingDescriptor, InputBinding,
  ListParam, ObservableValue, RawGraderResult, RuntimeProps, SingleParam, StateKey,
  SyncGraderFn,
} from '../types';

// Canonical declarations live in types/core.ts (one home, no cycles);
// re-exported here for grading-domain ergonomics.
export type {
  AsyncGraderFn, DictParam, GraderFn, GraderParams, GradingDescriptor, InputBinding,
  ListParam, RawGraderResult, SingleParam, SyncGraderFn,
};

/** One resolved grader input: live value, bound API, authoring metadata. */
export interface GraderInput {
  stateKey: StateKey;
  /** Display name for authoring-error messages (block name or tag). */
  name: string;
  /** The input's observable value — graders only ever see level-3 reads.
   *  ObservableValue (types/fieldValues.ts) declares that finality. */
  value: ObservableValue;
  api: Record<string, (...args: unknown[]) => unknown>;
  /** Explicit slot= attribute, for multi-input graders. */
  slot?: string;
  /** The input block's declared value type. */
  valueSchema?: z.ZodType;
  /** Input commits on change (radio/dropdown) — immediate mode shows
   *  incorrect instantly instead of softening to incomplete. */
  commitOnChange: boolean;
}

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
  param: GraderParams;
  ensureReady?: () => Promise<void>;
}

/**
 * The outcome of preparing a grade. Authoring/configuration failures
 * (missing slot, incompatible input type, no inputs) are values, not
 * throws — the caller renders them as correctness.invalid. The resolved
 * inputs survive either way, so a configuration error still records what
 * the learner actually submitted. Broken runtime invariants throw.
 */
export type GradePreparation =
  | { ok: true; inputs: GraderInput[]; prepared: PreparedGrade }
  | { ok: false; inputs: GraderInput[]; error: string };
