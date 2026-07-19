// packages/shared/lib/grading/gradingStore.ts
//
// The persisted grading schema — the per-field state a graded problem stores
// and reads back. One list of field names, one field resolver (honoring a
// block's own field overrides), one reader. submitGrade owns the WRITE
// ordering (`correct` last); everyone else reads through here.
//
import { correctness } from '../blocks/correctness';
import { commonFields } from '../state/commonFields';
import { decodedFieldSelector } from '../state/fieldReads';
import type { FieldInfo, LoBlock, RuntimeProps, StateKey } from '../types';
import type { GradingState } from './model';

/** The stored grading quartet. `lastSubmission` is captured separately (submit
 *  mode only) and is not part of the read-back state, so it lives in
 *  GradingFieldName but not this list. */
export const GRADING_STATE_FIELDS = ['correct', 'message', 'score', 'submitCount'] as const;

export type GradingFieldName = typeof GRADING_STATE_FIELDS[number] | 'lastSubmission';

/** The blank grading state — doubling as the per-field fallbacks for a store
 *  read (readStoredGradingState indexes it by field name). */
export const UNGRADED: GradingState = {
  correct: correctness.unsubmitted,
  message: '',
  score: undefined,
  submitCount: 0,
};

/**
 * Resolve a grading field's definition, honoring a block's own override
 * (a grader may redeclare `correct` etc.) ahead of the common field.
 */
export function gradingField(loBlock: LoBlock | undefined, name: GradingFieldName): FieldInfo {
  return (loBlock?.fields?.[name] as FieldInfo) ?? (commonFields as Record<string, FieldInfo>)[name];
}

/** Read one stored grading field (level 2 — the value, not the representation). */
export function readGradingField<T>(
  state: unknown, props: RuntimeProps, stateKey: StateKey, loBlock: LoBlock | undefined,
  name: GradingFieldName, fallback: T,
): T {
  return decodedFieldSelector(state, props, gradingField(loBlock, name), { stateKey, fallback });
}

/** The stored per-field grading state — the read half of submitGrade's write
 *  contract, honoring block-specific field overrides. Four explicit,
 *  type-checked reads: the fields are domain-significant and few, and spelling
 *  them out lets each read's fallback and return type be checked against
 *  GradingState (the Object.fromEntries form needed an `as unknown as` cast
 *  that bypassed exactly that). */
export function readStoredGradingState(
  state: unknown, props: RuntimeProps, stateKey: StateKey, loBlock: LoBlock | undefined,
): GradingState {
  const read = <T>(name: GradingFieldName, fallback: T) =>
    readGradingField(state, props, stateKey, loBlock, name, fallback);
  return {
    correct: read('correct', UNGRADED.correct),
    message: read('message', UNGRADED.message),
    score: read('score', UNGRADED.score),
    submitCount: read('submitCount', UNGRADED.submitCount),
  };
}
