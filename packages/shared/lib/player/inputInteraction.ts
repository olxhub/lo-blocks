// packages/shared/lib/player/inputInteraction.ts
//
// Input interaction state management - determines when inputs should be read-only
//
// Provides a clean abstraction for inputs to query their interaction state based on
// related grader correctness states. This replaces the problematic "submitted" boolean
// approach with a proper state query system based on existing correctness states.
//
import { useSelector } from 'react-redux';
import { correctness } from '../grading/correctness';
import { inferRelatedNodes } from '../blocks/dynamicDom';
import { selectGradingState } from '@/lib/grading';
import { isInputLocked } from '../grading/problemModes';
import { useEnclosingProblem } from './useEnclosingProblem';

/**
 * Hook: should this input be read-only?
 *
 * Priority order:
 * 1. Explicit readOnly prop (for Survey, custom containers, etc.)
 * 2. Related grader correctness state — locked while ANY related grader is
 *    in 'submitted' (pending async grading); a shared input must not be
 *    editable while one of its graders is still grading the snapshot.
 * 3. The enclosing problem's lockInput condition — read-only once the problem
 *    is 'attempted', 'closed', 'finished', 'correct' or 'always', so what is
 *    on screen stays what was scored. Derived from the problem's live state,
 *    so the lock survives a remount or a reload.
 * 4. Default to interactive (fail open)
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

  const problem = useEnclosingProblem(props);

  if (explicit) return Boolean(props.readOnly);
  return anyPending
    || (problem !== null && isInputLocked(problem.lockInput, problem.state));
}
