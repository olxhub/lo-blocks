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

/** Load the math engine (idempotent, cached). */
export async function ensureCalcLoaded(): Promise<void> {
  if (!calc) {
    // await import (documented exception): the whole point of this module —
    // keep mathjs out of the eager import graph of grader blueprints.
    calc = await import('@/lib/util/calc/index.js');
  }
}

/** Synchronous access to the loaded engine. Callers run after ensureCalcLoaded
 *  (parse/grade paths await it); the throw is the fail-fast backstop. */
export function requireCalc(): typeof CalcModule {
  if (!calc) {
    throw new Error(
      'The math engine is still loading. This can happen when a formula is ' +
      'evaluated in an expression (e.g. when=) before any math block has ' +
      'loaded — it resolves as soon as loading completes.'
    );
  }
  return calc;
}
