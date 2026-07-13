// packages/shared/lib/blocks/inputInteraction.ts
//
// Input interaction state management - determines when inputs should be read-only
//
// Provides a clean abstraction for inputs to query their interaction state based on
// related grader correctness states. This replaces the problematic "submitted" boolean
// approach with a proper state query system based on existing correctness states.
//
import { useSelector } from 'react-redux';
import { correctness } from './correctness';
import { inferRelatedNodes } from './olxdom';
import { selectGradingState } from '@/lib/grading';

/**
 * Hook: should this input be read-only?
 *
 * Priority order:
 * 1. Explicit readOnly prop (for Survey, custom containers, etc.)
 * 2. Related grader correctness state — locked while ANY related grader is
 *    in 'submitted' (pending async grading); a shared input must not be
 *    editable while one of its graders is still grading the snapshot.
 * 3. Default to interactive (fail open)
 *
 * TODO: Add attempt limiting logic based on container configuration.
 */
export function useInputReadOnly(props): boolean {
  const explicit = props.readOnly !== undefined;

  const graderIds = explicit ? [] : inferRelatedNodes(props, {
    selector: n => n.loBlock.isGrader,
    infer: true
  });

  const anyPending = useSelector((state: any) =>
    graderIds.some(id =>
      selectGradingState(state, props, id).correct === correctness.submitted));

  if (explicit) return Boolean(props.readOnly);
  return anyPending;
}
