// packages/shared/lib/grading/gradingStore.ts
//
// The persisted grading schema — the per-field state a graded problem stores
// and reads back. One list of field names, one field resolver (honoring a
// block's own field overrides), one reader. submitGrade owns the WRITE
// ordering (`correct` last); everyone else reads through here.
//
import { correctness } from './correctness';
import { commonFields } from '../state/commonFields';
import { decodedFieldSelector } from '../state/fieldReads';
import type { FieldInfo, LoBlock, RuntimeProps, StateKey } from '../types';
import type { GradingState } from './model';

/** The stored grading quartet. `lastSubmission` and `pendingGrade` are
 *  captured separately (submit mode only) and are not part of the read-back
 *  GradingState, so they live in GradingFieldName but not this list. */
export const GRADING_STATE_FIELDS = ['correct', 'message', 'score', 'submitCount'] as const;

export type GradingFieldName = typeof GRADING_STATE_FIELDS[number] | 'lastSubmission' | 'pendingGrade';

/**
 * The durable record of an in-flight async submission, stored in the grader's
 * `pendingGrade` field beside the quartet. Written at phase-1 submit (when
 * `correct` becomes 'submitted'), cleared when the result lands. Its presence
 * plus `submittedAt` is what lets a reader tell a genuinely-pending grade from
 * a STRANDED one (see selectGradingState's timeout derivation).
 *
 *   ┌─ BREADCRUMB for the follow-up PR (server-owned async jobs) ──────────┐
 *   │ Today `id` is a client-minted GUID and the only async grader is      │
 *   │ client-side (callLLMSimple): a reload kills the request, so the      │
 *   │ pending record strands and the timeout below is what unlocks retry.  │
 *   │ Liveness for that unlock is a CLIENT timer that dispatches a         │
 *   │ PENDING_GRADE_TIMEOUT event at the deadline (lib/grading/            │
 *   │ pendingTimeout.ts) — pure client scaffolding for a request the       │
 *   │ client itself was awaiting.                                          │
 *   │                                                                      │
 *   │ The B end state: `id` becomes a DURABLE SERVER JOB ID. This field is │
 *   │ server-shared state (the direction is client read-only) — the        │
 *   │ server writes the record when it enqueues the job and writes the     │
 *   │ result when the job finishes. On reload the client RE-ATTACHES by    │
 *   │ polling the job named by `id` instead of deriving failure — so the   │
 *   │ client timer/PENDING_GRADE_TIMEOUT dispatch retires in favor of the  │
 *   │ poll. Timeout and retry stop being the module constant below and     │
 *   │ become module-contributed PMSS policy, overrideable at the server    │
 *   │ level. Keep this field the single home for that state as it grows.   │
 *   └──────────────────────────────────────────────────────────────────────┘
 */
export interface PendingGrade {
  /** Client-minted GUID today; a durable server job ID in the follow-up. */
  id: string;
  /** Epoch ms stamped at phase-1 submit — the clock the timeout reads. */
  submittedAt: number;
}

/**
 * How long a stored `correct='submitted'` stays believable before a reader
 * treats it as a stranded submission (failed-retryable). Three minutes covers
 * a slow LLM round-trip with margin. In the follow-up this becomes
 * module-contributed PMSS policy (timeout + retry), overrideable at the server
 * level; today it is one fixed constant for the one client-side async grader.
 */
export const PENDING_GRADE_TIMEOUT_MS = 3 * 60 * 1000;

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
