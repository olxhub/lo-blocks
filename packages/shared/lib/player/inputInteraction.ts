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

/**
 * Hook: should this input be read-only?
 *
 * An input is locked by its own readOnly prop, inherited container policy, or
 * related grader state. Related graders may be parents or explicit targets;
 * lock while any is awaiting asynchronous grading so the submitted snapshot
 * cannot change underneath it.
 */
export function useInputReadOnly(props): boolean {
  const imposedReadOnly = props.readOnly === true
    || props.runtime.inputPolicy?.readOnly === true;

  const graderIds = imposedReadOnly ? [] : inferRelatedNodes(props, {
    selector: n => n.loBlock.isGrader,
    infer: true
  });

  const anyPending = useSelector((state: any) =>
    graderIds.some(id =>
      selectGradingState(state, props, id).correct === correctness.submitted));

  return imposedReadOnly || anyPending;
}
