// packages/shared/lib/grading/useCorrectness.ts
//
// The single read point for a grader's grading state.
//
// UI components (Correctness icon, footers, input locking) should read
// grading state through this hook rather than subscribing to raw fields.
// Today there is one source of truth: the grader's stored fields, written
// per-field by the grading action (lib/blocks/actions.tsx). That covers both
// the submit path and the async/slow path — a slow grader writes
// correct='submitted' when grading starts and the final result when it
// lands, and this hook's subscribers update on each write.
//
// PLANNED: derived correctness. For immediate-mode sync graders, correctness
// becomes a pure function of the live input values (a selector over
// input.value calling the grader's evaluate step) instead of stored state.
// That branch lands here, keyed off the grader blueprint, so consumers never
// know which world they're in.
//
'use client';
import { correctness } from '../blocks/correctness';
import { componentFieldByStateKey, useFieldSelector } from '../state/redux';
import type { RuntimeProps, StateKey } from '../types';

export interface GraderGradingState {
  /** A `correctness` enum value ('correct', 'submitted', 'unsubmitted', …). */
  correct: string;
  message: string;
  score: number | undefined;
  submitCount: number;
}

export function useCorrectness(props: RuntimeProps, graderStateKey: StateKey): GraderGradingState {
  // Field lookups go through the grader's own field declarations so a grader
  // that overrides a field type still resolves correctly.
  const read = <T,>(name: string, fallback: T): T => {
    const field = componentFieldByStateKey(props, graderStateKey, name);
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed call order: `read` runs unconditionally for the same four fields every render
    return useFieldSelector(props, field, {
      stateKey: graderStateKey,
      fallback,
      selector: s => (s?.[name] ?? fallback) as T,
    });
  };

  return {
    correct: read<string>('correct', correctness.unsubmitted),
    message: read<string>('message', ''),
    score: read<number | undefined>('score', undefined),
    submitCount: read<number>('submitCount', 0),
  };
}
