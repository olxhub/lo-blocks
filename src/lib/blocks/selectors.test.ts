// src/lib/blocks/selectors.test.ts
import { __testables } from '../state/selectors';

const { normalizeOptions } = __testables;

describe('normalizeOptions', () => {
  it('returns empty object for undefined', () => {
    expect(normalizeOptions(undefined)).toEqual({});
  });
  it('wraps function as equalityFn', () => {
    const eq = (a: any, b: any) => a === b;
    expect(normalizeOptions(eq)).toEqual({ equalityFn: eq });
  });
  it('passes through options object', () => {
    const opts = { fallback: 3, equalityFn: (a: any, b: any) => a === b, extra: 5 };
    expect(normalizeOptions(opts)).toEqual(opts);
  });
  it('throws on bad input', () => {
    expect(() => normalizeOptions(42)).toThrow(/Invalid selector options/);
    expect(() => normalizeOptions(true)).toThrow(/Invalid selector options/);
    expect(() => normalizeOptions('oops')).toThrow(/Invalid selector options/);
  });
});
