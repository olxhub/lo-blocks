// The `contains` matcher exists twice — here and in olx_prompts._edit_within —
// because the browser has no dictionary or spell-checker and this is the engine
// the student actually meets. Two implementations of one rule is exactly the
// divergence this project closes, so both read the SAME table: this test asserts
// the TS side, and enforcement.check_contains_matcher_agrees_across_engines
// asserts the Python side against the identical file. Drift in either one fails.
import { describe, it, expect } from 'vitest';
import { parseDerived } from './slotSheet';
import { verdictFor } from './derivedVerdicts';
import cases from './containsCases.json';

describe('contains matcher, shared cross-engine table', () => {
  for (const c of cases as { text: string; words: string[]; met: boolean; why: string }[]) {
    it(`${c.why}: ${JSON.stringify(c.text)}`, () => {
      const rule = parseDerived(`k:contains:a:${c.words.join(',')}`)[0];
      expect(verdictFor(rule, [c.text]).verdict === 'met').toBe(c.met);
    });
  }
});
