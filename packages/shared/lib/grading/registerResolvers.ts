// packages/shared/lib/grading/registerResolvers.ts
//
// Wire grading into the state language: DSL expressions like
// when="@problem.correct === correctness.correct" resolve grader
// references through selectGradingState (metagraders never store
// aggregates; immediate-mode leaves derive from live inputs).
//
// Called from blockRegistry construction — the one module every rendering
// entry point loads — rather than as an import side effect of a hook
// module. Registration (not a static import from stateLanguage) avoids the
// module cycle olxdom → stateLanguage → grading → olxdom.
//
import { registerGraderStateResolver } from '../stateLanguage/hooks';
import { selectGradingState } from './selectGradingState';
import type { StateKey } from '../types';

export function registerGradingResolvers(): void {
  registerGraderStateResolver((state, props, stateKey) =>
    selectGradingState(state, props, stateKey as StateKey));
}
