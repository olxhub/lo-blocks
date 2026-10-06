// packages/shared/lib/state/sync/materialization.test.ts
//
// Reseeding must not corrupt the state it is seeding from.
//
// `system` is the odd scope: every other persisted scope is a MAP of buckets
// keyed by block id, but system is ONE bucket whose keys are field names and
// whose values are field values. Code that walks the scopes uniformly spreads
// each system field VALUE as though it were a bucket object, and object-spread
// on a primitive is silent and lossy — a string becomes a map of its character
// positions, a number becomes {}.
//
// That is what shipped. A user's stored system bucket read
//
//   {"field":{"0":"l","1":"o","2":"c","3":"a","4":"l","5":"e"},
//    "locale":{...}, "ts":{}, "actor":{"0":"6",...}}
//
// and nothing complained, because nothing reads those keys back. It is pinned
// here rather than left to review because the damage happens on RESEED —
// reconnect, second tab, server restart — not on the write, so the reducer
// tests all pass while the stored state rots.
import { describe, it, expect } from 'vitest';
import { ServerState } from './materialization';

describe('ServerState.seed', () => {
  it('merges the system bucket by FIELD, leaving values intact', () => {
    const s = new ServerState();
    s.seed({
      system: {
        locale: { code: 'en', dir: 'ltr' },
        'locale.ts': 1786640279045,
        'locale.actor': 'b58dd01e-497d-4eae-af76-de360bc360ec',
      },
    });

    const system = (s.state as any).system;
    // The exact regression: a string field must not come back as {"0":"l",…},
    // and a number must not come back as {}.
    expect(system.locale).toEqual({ code: 'en', dir: 'ltr' });
    expect(system['locale.actor']).toBe('b58dd01e-497d-4eae-af76-de360bc360ec');
    expect(system['locale.ts']).toBe(1786640279045);
  });

  it('survives repeated reseeds unchanged', () => {
    // One seed was never the failure; the corruption compounded across
    // reconnects, so seeding the OUTPUT of a seed is the honest test.
    const s = new ServerState();
    const stored = { locale: { code: 'fr', dir: 'ltr' }, 'locale.actor': 'abc-123', 'locale.ts': 42 };
    s.seed({ system: stored });
    // Each reconnect seeds from what the last one persisted.
    for (let i = 0; i < 3; i++) s.seed({ system: (s.state as any).system });
    expect((s.state as any).system).toEqual(stored);
  });

  it('keeps live system values ahead of stored ones', () => {
    // Live-wins is the documented rule for seed(); the fix must not quietly
    // invert it for system while fixing the shape.
    const s = new ServerState();
    (s.state as any).system = { locale: { code: 'ar', dir: 'rtl' } };
    s.seed({ system: { locale: { code: 'en', dir: 'ltr' }, themeBrand: 'memphis' } });

    const system = (s.state as any).system;
    expect(system.locale).toEqual({ code: 'ar', dir: 'rtl' });  // live wins
    expect(system.themeBrand).toBe('memphis');                   // stored-only survives
  });

  it('still merges keyed scopes bucket-by-bucket', () => {
    // The uniform walk was right for every OTHER scope, and special-casing
    // system must not cost component its field-level merge.
    const s = new ServerState();
    (s.state as any).component = { blk: { value: 'live' } };
    s.seed({ component: { blk: { value: 'stored', extra: 'kept' }, other: { value: 'x' } } });

    const component = (s.state as any).component;
    expect(component.blk).toEqual({ value: 'live', extra: 'kept' });
    expect(component.other).toEqual({ value: 'x' });
  });
});
