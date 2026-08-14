// Enforcement probe: report what a slot sheet ENFORCES, by exercising it.
//
// Driven by ~/code/molly_scoring/scorer/equivalence.py --enforcement, which
// compares the answers against the CLI scorer's. Gated on RUN_SLOT_PROBE so a
// normal `vitest run` skips it, matching runner.test.ts.
//
// Why probe rather than read the attributes. The CLI expresses the same rules in
// Python — `derive_oc_ledger` computes its type comparison and uses `elif` for
// charge-once — so an attribute-to-attribute diff would only ever compare this
// side against a hand-written copy of the other, and the copy is what rots. What
// both sides DO can be observed. A rule that exists on one side and not the other
// then shows up as a different answer here, which is the gap that went unnoticed
// on Q6 for months: the web enforced distinctness, the CLI did not, and neither
// audit mode could see it.

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import PRIMITIVES from './primitives.json';
import {
  parseSlots,
  parseCover,
  parseEquals,
  parseOnlyIf,
  parseDerived,
  parseCounts,
  scoreSlotSheet,
  DEFAULT_VERDICTS,
  type CheckPayload,
  type ExpectRule,
  parseExpect,
  parseChoices,
  type SlotSpec,
  type CoverGroup,
} from './slotSheet';

type Req = {
  item: string;
  slots: string;
  verdicts?: string;
  cover?: string;
  choices?: string;
  expect?: string;
  equals?: string;
  onlyif?: string;
  derived?: string;
  counts?: string;
  max?: number;
};

/**
 * The verdict that SATISFIES a slot: its group label if grouped, else option 0.
 *
 * Labels are claimed PER GROUP. Sharing one claimed-set across groups would hand
 * the second group's slots labels its first group had already taken, leaving a
 * duplicate that fails cover — the all-satisfied baseline would not be full
 * marks, and every loss measured from it would be wrong.
 */
function pass(slot: SlotSpec, cover: CoverGroup[], claimed: Map<CoverGroup, Set<string>>): string {
  const g = cover.find(c => c.keys.includes(slot.key));
  if (!g) return slot.options[0];
  if (!claimed.has(g)) claimed.set(g, new Set());
  const taken = claimed.get(g)!;
  const free = g.labels.find(l => !taken.has(l));
  if (free) taken.add(free);
  return free ?? g.labels[0];
}

/** A verdict that does NOT satisfy a slot. */
function fail(slot: SlotSpec, cover: CoverGroup[]): string {
  const g = cover.find(c => c.keys.includes(slot.key));
  if (g) {
    const outside = slot.options.find(o => !g.labels.includes(o));
    return outside ?? 'neither';
  }
  return slot.options.find(o => o !== slot.options[0]) ?? 'absent';
}

/** The member an `expect` rule wants for this slot, or the set's first. */
function pickPass(slot: SlotSpec, expect: ExpectRule[], choices: Record<string, string[]>): string {
  const rule = expect.find(r => r.left === slot.key);
  return rule ? rule.value : (choices[slot.picks!] ?? [''])[0];
}

/** Any OTHER member, so the rule reading this slot fails. */
function pickFail(slot: SlotSpec, expect: ExpectRule[], choices: Record<string, string[]>): string {
  const want = pickPass(slot, expect, choices);
  const rule = expect.find(r => r.left === slot.key);
  const lenient = new Set(rule?.lenient ?? []);
  return (choices[slot.picks!] ?? []).find(v => v !== want && !lenient.has(v)) ?? want;
}

function probe(req: Req) {
  const defaults = req.verdicts
    ? req.verdicts.split(',').map(v => v.trim()).filter(Boolean)
    : DEFAULT_VERDICTS;
  const slots = parseSlots(req.slots, defaults);
  const cover = parseCover(req.cover);
  const equals = parseEquals(req.equals);
  const onlyif = parseOnlyIf(req.onlyif);
  const derived = parseDerived(req.derived);
  const counts = parseCounts(req.counts);
  const choices = parseChoices(req.choices);
  const expect = parseExpect(req.expect);

  const sheet = (failing: string[]) => {
    const claimed = new Map<CoverGroup, Set<string>>();
    const checks: Record<string, CheckPayload> = {};
    // Satisfying values are assigned first so cover labels are claimed in order;
    // a failing slot must not consume a label it is not meant to hold.
    for (const s of slots) {
      if (failing.includes(s.key)) continue;
      checks[s.key] = s.picks
        ? { refers_to: pickPass(s, expect, choices) }
        : { verdict: pass(s, cover, claimed) };
    }
    for (const k of failing) {
      const s = slots.find(x => x.key === k);
      if (!s) continue;
      checks[k] = s.picks
        ? { refers_to: pickFail(s, expect, choices) }
        : { verdict: fail(s, cover) };
    }
    return checks;
  };

  const score = (failing: string[]) =>
    scoreSlotSheet(slots, sheet(failing), req.max, cover, equals, onlyif);

  const base = score([]);
  const max = base?.max ?? 0;
  const loss = (keys: string[]) => {
    const r = score(keys);
    return r ? Math.round((max - r.score) * 1000) / 1000 : 0;
  };

  const scored = slots.filter(s => typeof s.pts === 'number');
  // Every slot is flipped, not just the scored ones: a gate commonly carries no
  // points of its own (`!names_behavior`) and would be invisible otherwise.
  const single: Record<string, number> = {};
  for (const s of slots) single[s.key] = loss([s.key]);

  const gates: string[] = [];
  const ignored: string[] = [];
  for (const s of slots) {
    if (max > 0 && single[s.key] >= max) gates.push(s.key);
    else if (typeof s.pts === 'number' && single[s.key] === 0) ignored.push(s.key);
  }
  const keys = scored.map(s => s.key);

  // Charge-once pairs are NOT discovered here. This side declares them
  // (`onlyif`), so there is nothing to infer; and an open-ended search for
  // "two findings that cost less together" also reports pairs that are merely
  // both operands of an `equals` — flip them both to the same wrong value and
  // they agree again, so the computed check comes back satisfied. That is real
  // behaviour, not a charge-once rule. Discovery belongs on the CLI side, where
  // the rules are in Python and the flip values can be chosen to avoid it.
  const declaredPairs = onlyif.map(r => [r.key, r.cond] as [string, string]);

  return {
    item: req.item,
    baseline: base?.score ?? null,
    max,
    scored: scored.map(s => ({ key: s.key, pts: s.pts, options: s.options })),
    declaredGates: slots.filter(s => s.gates).map(s => s.key),
    cover: cover.map(g => ({ keys: g.keys, labels: g.labels })),
    // Everything the model is NOT asked for, whatever the mechanism. A new
    // primitive that lands here without being added to this list would make the
    // audit silently blind to it — which is how `derived` was missed once.
    computed: [...equals.map(r => r.key), ...derived.map(r => r.key),
               ...counts.flatMap(g => g.slots)],
    derived: derived.map(r => ({ key: r.key, targets: r.targets,
                                 hasTemplate: r.template.length > 0 })),
    equals: equals.map(r => ({ key: r.key, operands: [r.left, r.right], lenient: r.lenient })),
    onlyif: onlyif.map(r => ({ key: r.key, cond: r.cond })),
    gates,
    ignored,
    chargeOnce: declaredPairs,
    singleLoss: single,
  };
}

describe('enforcement probe', () => {
  it('handles every primitive in the shared registry', () => {
    // If a primitive is added to primitives.json and not parsed here, the audit
    // silently stops seeing it — which is how `derived` went unnoticed once.
    const handled = ['cover', 'equals', 'onlyif', 'derived', 'counts', 'expect'];
    expect(PRIMITIVES.primitives.map(p => p.attr).sort()).toEqual([...handled].sort());
  });

  it.runIf(process.env.RUN_SLOT_PROBE === '1')('answers what each sheet enforces', () => {
    const reqs: Req[] = JSON.parse(readFileSync(process.env.PROBE_JSON!, 'utf8'));
    const out = reqs.map(probe);
    for (const r of out) {
      // A sheet whose all-satisfied baseline is not full marks is broken, and
      // every probe below it would be measuring from the wrong origin.
      expect(r.baseline, `${r.item} baseline`).toBe(r.max);
    }
    writeFileSync(process.env.PROBE_OUT!, JSON.stringify(out, null, 1));
    console.log(`[probe] ${out.length} item(s) -> ${process.env.PROBE_OUT}`);
  });

  it('probes a known sheet correctly', () => {
    // Self-checks so the probe logic is not itself the unverified part.
    const r = probe({
      item: 'T',
      slots: '!g:Gate:met/absent|a:A:met/absent@2|b:B:met/absent@2|c:C:met/absent@1',
      max: 5,
    });
    expect(r.baseline).toBe(5);
    expect(r.gates).toEqual(['g']);            // unscored, but zeroes the item
    expect(r.ignored).toEqual([]);
    expect(r.chargeOnce).toEqual([]);
    expect(r.singleLoss).toMatchObject({ g: 5, a: 2, b: 2, c: 1 });
  });

  it('sees a cover group as order-free, and its baseline as full marks', () => {
    const r = probe({
      item: 'C',
      slots: 's1:S1:first/second/neither@2|s2:S2:first/second/neither@2',
      cover: 's1,s2:first,second',
      max: 4,
    });
    expect(r.baseline).toBe(4);                // distinct labels assigned per group
    expect(r.cover).toEqual([{ keys: ['s1', 's2'], labels: ['first', 'second'] }]);
    expect(r.singleLoss).toMatchObject({ s1: 2, s2: 2 });
  });

  it('reports a computed check as ignored, and the declared charge-once pair', () => {
    const r = probe({
      item: 'E',
      slots: 'o:O:PR/NR@1|n:N:PR/NR@1|m:M:yes/no@2|t:T:yes/no@2',
      equals: 'm:o,n',
      onlyif: 't:o',
      max: 6,
    });
    expect(r.ignored).toContain('m');          // not asked; derived from o and n
    expect(r.computed).toEqual(['m']);
    expect(r.chargeOnce).toEqual([['t', 'o']]);   // as declared: t only if o
    expect(r.onlyif).toEqual([{ key: 't', cond: 'o' }]);
  });
});
