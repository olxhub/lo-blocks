// Is any slot's verdict written by TWO computed primitives?
//
// Ported from `enforcement.check_one_writer_per_computed_key` (goal K).
//
// WHY IT IS A DEFECT AND NOT A PREFERENCE. `expect` does not override a verdict
// on failure -- it REPLACES it. So a key written by both `maps` and `expect`
// resolves by LOOP ORDER, and on 2026-09-08 the two engines ordered them
// oppositely: `slotSheet.satisfiedMap` runs equals, expect, forbid, MAPS LAST,
// while `agreement.apply_computed` ran expect last. Same rubric, same answers,
// two different scores -- a box correctly failing as `consequence` came out
// `met` because the expect clause overwrote the mapped verdict wholesale.
//
// THE READ-AFTER-WRITE ARM is the same hazard one step out: an `expect` or
// `equals` whose OPERAND is a key another primitive writes reads a different
// value depending on where its loop sits. Both engines agree on the order
// today, so it is a warning rather than a divergence -- but a rubric that
// relies on the order is relying on something authored data may not.

import { pyReprStr } from './pythonRepr';

/**
 * Python's `str(a_list_of_strings)` -- `['a', 'b']`, with the space.
 *
 * `JSON.stringify` renders `["a","b"]`: double quotes and NO space after the
 * comma. Both differences reach the finding text, and a finding that differs
 * from python's by two characters is indistinguishable, in a baseline diff,
 * from a new fault.
 */
function pyList(xs: string[]): string {
  return `[${xs.map(pyReprStr).join(', ')}]`;
}

export type WriterItem = {
  id: string;
  /** Keys each computed primitive writes, per primitive. */
  writers: Record<string, string[]>;
  equals: Array<{ key: string; left: string | null; right: string | null }>;
  expect: Array<{ key: string; left: string | null }>;
};

export function oneWriterPerComputedKey(p: { items: WriterItem[] }): string[] {
  const out: string[] = [];
  for (const it of p?.items ?? []) {
    // key -> the primitives that write it, built in python's COMPUTED order so
    // the `sorted(prims)` below has the same members to sort.
    const writers = new Map<string, string[]>();
    for (const [prim, keys] of Object.entries(it.writers ?? {})) {
      for (const key of keys ?? []) {
        if (!key) continue;
        if (!writers.has(key)) writers.set(key, []);
        writers.get(key)!.push(prim);
      }
    }
    for (const key of [...writers.keys()].sort()) {
      const prims = writers.get(key)!;
      if (prims.length > 1) {
        out.push(
          `${it.id}/${key} is written by ${pyList([...prims].sort())} -- TWO computed ` +
          `primitives on one key. \`expect\` REPLACES a verdict rather ` +
          `than overriding it, so which one wins is decided by loop ` +
          `order, and that is not something authored data may rely ` +
          `on. Give the second rule its own key.`);
      }
    }
    const written = new Set(writers.keys());
    // `expect` THEN `equals`, which is python's tuple order -- the findings
    // come out in it and a baseline diff compares them in it.
    for (const prim of ['expect', 'equals'] as const) {
      const rules: Array<{ key: string; left: string | null; right?: string | null }> =
        prim === 'expect' ? (it.expect ?? []) : (it.equals ?? []);
      for (const r of rules) {
        for (const operand of ['left', 'right'] as const) {
          const o = (r as Record<string, unknown>)[operand] as string | null | undefined;
          if (o && written.has(o)) {
            out.push(
              `${it.id}/${r.key}'s \`${prim}\` reads \`${o}\`, which ` +
              `${pyList([...writers.get(o)!].sort())} also writes -- a ` +
              `read-after-write whose value depends on loop ` +
              `order. Both engines agree on the order today; do ` +
              `not make it load-bearing.`);
          }
        }
      }
    }
  }
  return out;
}
