// packages/shared/lib/llm/llmActionSmoke.test.ts
//
// Does LLMAction's action still RUN?
//
// It had no test at all. Everything around it is covered — slotSheet is a leaf
// module with 88 unit tests, the runner drives real jobs — but the function that
// assembles the call was exercised only by a live run against a real provider.
//
// That is the worst place for a gap, because of how the failure presents. The
// harness retries a throw with exponential backoff, so an ordinary programming
// error does not appear as an error: the run simply stops making requests and
// sits there. It cost roughly an hour twice in one afternoon — once when
// `required` and `properties` disagreed and the provider 400'd every call, once
// when `cover` was passed to buildSlotSchema one line above its own `const`,
// which throws ReferenceError before any request is made.
//
// Neither was caught by the type checker or by 2000 other tests. Both would have
// been caught here, because this asks the only question that matters at this
// boundary: given an authored block, does the thing complete without throwing,
// and is what it sends well-formed?
import { describe, it, expect } from 'vitest';
import {
  parseSlots, parseCover, parseCounts, parseEquals, parseDerived,
  buildSlotSchema, DEFAULT_VERDICTS,
} from './slotSheet';

// The attribute shapes really authored in the handouts, including the two that
// broke: a cover group (adds `refers_to`) and a count group (swaps `verdict`
// for `count`).
const AUTHORED = {
  slots: 'a:Names the first thing@1.25|b:Names the second thing@1.25'
       + '|n:How many reasons:count(3)|r1:First@1|r2:Second@1|r3:Third@1'
       + '|why:Explains it:unclear/wrong_kind@2|confident:All judgments confident',
  cover: 'a,b:first,second',
  counts: 'n:r1,r2,r3',
};

describe('the schema LLMAction sends', () => {
  // Mirrors LLMAction's own assembly order. If that function starts parsing
  // something new, this is where the omission shows up.
  const slots = parseSlots(AUTHORED.slots, DEFAULT_VERDICTS);
  const cover = parseCover(AUTHORED.cover);
  const counts = parseCounts(AUTHORED.counts);
  const equals = parseEquals(undefined);
  const derived = parseDerived(undefined);

  const schema: any = buildSlotSchema(slots, equals, derived, counts, true, cover);
  const checks = schema.properties.checks.properties;

  it('builds without throwing, for every authored shape at once', () => {
    expect(Object.keys(checks).length).toBeGreaterThan(0);
  });

  it('is well-formed for a strict provider', () => {
    // The exact rule Azure enforces, and the one that 400'd every call: every
    // key in `properties` must appear in `required`.
    for (const [key, spec] of Object.entries<any>(checks)) {
      expect(new Set(spec.required), `check '${key}'`)
        .toEqual(new Set(Object.keys(spec.properties)));
      expect(spec.additionalProperties, `check '${key}'`).toBe(false);
    }
    expect(schema.properties.checks.additionalProperties).toBe(false);
  });

  it('asks each check for the ONE field its kind answers', () => {
    expect(Object.keys(checks.n.properties)).toContain('count');
    expect(Object.keys(checks.n.properties)).not.toContain('verdict');

    expect(Object.keys(checks.a.properties)).toContain('refers_to');
    expect(Object.keys(checks.a.properties)).toContain('verdict');

    expect(Object.keys(checks.why.properties)).toContain('verdict');
    expect(Object.keys(checks.why.properties)).not.toContain('refers_to');
  });

  it('leaves computed checks out of the schema entirely', () => {
    // Counted members are derived from the count; asking for an answer that is
    // then discarded is the incoherence the sheet exists to avoid.
    for (const k of ['r1', 'r2', 'r3']) expect(checks[k]).toBeUndefined();
  });

  it('offers the cover group its own labels, plus none', () => {
    expect(checks.a.properties.refers_to.enum).toEqual(['first', 'second', 'none']);
  });
});
