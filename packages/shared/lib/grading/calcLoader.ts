// packages/shared/lib/grading/calcLoader.ts — Lazy singleton for the math engine.
//
// calc/ (mathjs, ~2MB + slow init) must not load eagerly: most courses
// (writing, psychology, interdisciplinary) use no math, and the grader
// blueprints that reference these matchers load in every node script and
// server process. The engine loads once, at first actual use:
//
//   - parseOLX awaits the blueprint's ensureReady before validating/parsing
//     a math grader tag (content with math pays for math at parse time);
//   - the grading action path awaits ensureReady before grading;
//   - _FormulaInput's lazy chunk imports calc statically, so any page
//     showing a formula input has the engine loaded long before grading —
//     instant-mode grading stays instant (synchronous after first load).
//
// requireCalc() is the synchronous accessor for match/validate functions;
// it throws a clear error on the one path that can't await (a DSL
// expression calling formulaMatch before anything loaded the engine).

import type * as CalcModule from '@/lib/util/calc/index.js';

let calc: typeof CalcModule | null = null;
let loading: Promise<typeof CalcModule> | null = null;

/** Load the math engine (idempotent; concurrent callers share one load). */
export async function ensureCalcLoaded(): Promise<void> {
  if (!calc) {
    // await import (documented exception): the whole point of this module —
    // keep mathjs out of the eager import graph of grader blueprints.
    loading ??= import('@/lib/util/calc/index.js');
    calc = await loading;
  }
}

/** Synchronous access to the loaded engine.
 *
 *  Parse/grade paths await ensureCalcLoaded first, but sync paths can reach
 *  a match function with the engine unloaded: browsers receive PRE-PARSED
 *  OlxJson (/api/olxjson, static builds) — parseOLX's ensureReady never ran
 *  there — and DSL calls in when= expressions or a RulesGrader's rules have
 *  no await point of their own. So a miss here KICKS OFF the load before
 *  throwing: the failure is retriable (next grade click / next when=
 *  re-evaluation succeeds) instead of permanent. */
export function requireCalc(): typeof CalcModule {
  if (!calc) {
    void ensureCalcLoaded();
    throw new Error(
      'The math engine loads on first use and is not ready yet — ' +
      'try again in a moment.'
    );
  }
  return calc;
}
