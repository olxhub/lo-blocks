// packages/shared/lib/grading/useGradingState.ts
//
// React subscription to a grader's grading state. All the logic lives in
// selectGradingState.ts (pure); this file only binds it to react-redux.
//
'use client';
import { useSelector, shallowEqual } from 'react-redux';
import { selectGradingState } from './selectGradingState';
import type { GradingState } from './model';
import type { RuntimeProps, StateKey } from '../types';

/**
 * Subscribe to a grader's grading state (correctness, feedback, score,
 * attempts). graderStateKey is typically props.graderId (injected by render
 * for requiresGrader blocks) or the block's own nodeInfo.stateKey.
 */
export function useGradingState(props: RuntimeProps, graderStateKey: StateKey | undefined): GradingState {
  return useSelector(
    (state: any) => selectGradingState(state, props, graderStateKey),
    shallowEqual,
  );
}
