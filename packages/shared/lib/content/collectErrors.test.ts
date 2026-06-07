// packages/shared/lib/content/collectErrors.test.ts
import { describe, it, expect } from 'vitest';
import { collectErrors } from './collectErrors';

const errorNode = (id: string, attributes: any) => ({
  id, tag: 'ErrorNode', attributes, kids: [], provenance: [],
});

describe('collectErrors', () => {
  it('returns [] for null/undefined/empty', () => {
    expect(collectErrors(null)).toEqual([]);
    expect(collectErrors(undefined)).toEqual([]);
    expect(collectErrors({} as any)).toEqual([]);
  });

  it('extracts ErrorNode entries and ignores normal blocks', () => {
    const idMap: any = {
      'ns/ok': { base: { id: 'ns/ok', tag: 'Markdown', attributes: {}, kids: [] } },
      'ns/bad': {
        base: errorNode('ns/bad', {
          type: 'parse_error', title: 'T', message: 'boom',
          location: { provenance: ['x'] }, technical: { tag: 'X' },
        }),
      },
    };
    const errs = collectErrors(idMap);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      id: 'ns/bad', type: 'parse_error', title: 'T', message: 'boom',
    });
    expect(errs[0].location).toEqual({ provenance: ['x'] });
  });

  it('defaults a missing message', () => {
    const [e] = collectErrors({ 'ns/e': { en: errorNode('ns/e', {}) } } as any);
    expect(e.message).toBe('Unknown error');
  });

  it('emits one error per node id even across multiple variants', () => {
    const idMap: any = {
      'ns/e': {
        base: errorNode('ns/e', { message: 'a' }),
        es: errorNode('ns/e', { message: 'a' }),
      },
    };
    expect(collectErrors(idMap)).toHaveLength(1);
  });

  it('works the same on a parse-result idMap and a live-store-shaped idMap', () => {
    // Render errors land as derived-key `_error_` ErrorNodes in olxjson; a
    // store snapshot is just another idMap, so the same query reads it.
    const liveSnapshot: any = {
      'ns/_error_thing': { base: errorNode('ns/_error_thing', { message: 'render boom', stack: 'at x' }) },
    };
    const errs = collectErrors(liveSnapshot);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ id: 'ns/_error_thing', message: 'render boom', stack: 'at x' });
  });
});
