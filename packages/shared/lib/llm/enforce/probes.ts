// THIS SIDE of a two-implementation comparison.
//
// Some rules cannot be judged in one language, because the whole question is
// whether TWO implementations agree: `corpus_resolve.py` against
// `resolveCorpusRefs.ts`, `olx_prompts.parse_slots` against
// `slotSheet.parseSlots`. Python is the only place both are reachable, so
// python does the COMPARING. What it needs from here is this side's answer.
//
// WHY THEY LIVE HERE AND NOT IN A PYTHON STRING. `check_ref_grammars.py` and
// `check_slot_grammars.py` each carried their TypeScript as a `DRIVER = """..."""`
// literal written to a temp file at run time — TypeScript that `tsc --noEmit`
// never saw, that no test exercised, and that imported the module under test by
// ABSOLUTE PATH. A driver that fails to compile reports as "the TypeScript
// driver failed", which is indistinguishable from the divergence it exists to
// find. Here they are typechecked with everything else and imported relatively.
//
// A PROBE RETURNS DATA, NOT FINDINGS, which is why the registry keeps them
// apart from RULES. Returning `[]` from a rule means "this holds"; returning
// `[]` from a probe means "this implementation produced nothing", and a runner
// that could not tell those apart would report a dead probe as a passing rule.

import { resolve as resolveCorpusRef } from '../../../scripts/resolveCorpusRefs';
import { parseSlots } from '../slotSheet';

/** Each reference resolved by the TypeScript resolver, or 'ERROR'. */
export function resolveCorpusRefs(
  p: { data: Record<string, string>; refs: string[] },
): string[] {
  return (p?.refs ?? []).map(ref => {
    try {
      return resolveCorpusRef(ref, p.data ?? {}, 'grammar-probe');
    } catch {
      // 'ERROR' rather than a throw, because the python side records its own
      // failures the same way and the comparison is of BOTH outcomes. A probe
      // that dies on the first bad case hides every case after it.
      return 'ERROR';
    }
  });
}

/** Each slot spec parsed by the TypeScript parser, narrowed to the compared fields. */
export function parseSlotSpecs(
  p: { specs: string[]; defaults?: string[] },
): unknown[] {
  const defaults = p?.defaults ?? ['met', 'absent'];
  return (p?.specs ?? []).map(spec =>
    parseSlots(spec, defaults).map((d: any) => ({
      key: d.key ?? null, label: d.label ?? null,
      options: d.options ?? null, points: d.points ?? null,
    })));
}
