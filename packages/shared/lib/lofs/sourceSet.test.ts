// @vitest-environment node
//
// Union operations over a set of source providers (lib/lofs/sourceSet.ts):
// the merge/routing semantics of the read/compile union, now explicit
// functions rather than a stacked provider.

import { readFirst, grepAll, namespaceForAcross } from './sourceSet';
import { NamespaceResolutionError, type StorageProvider, type GrepMatch } from '../types/storage';
import type { LofsRef, OlxRelativePath } from '../types';

/** A source stub — only the methods a given test exercises need to exist. */
const source = (partial: Partial<StorageProvider>): StorageProvider => partial as StorageProvider;

describe('readFirst', () => {
  it('falls through a not-found source to the next that has the file', async () => {
    const a = source({ read: async () => { throw new Error('not found'); } });
    const b = source({ read: async () => ({ content: 'from B' }) as any });
    const result = await readFirst([a, b], 'x.olx' as OlxRelativePath);
    expect(result.content).toBe('from B');
  });

  it('treats ENOENT as not-found and keeps looking', async () => {
    const a = source({ read: async () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); } });
    const b = source({ read: async () => ({ content: 'from B' }) as any });
    const result = await readFirst([a, b], 'x.olx' as OlxRelativePath);
    expect(result.content).toBe('from B');
  });

  it('propagates a real read failure instead of masking it with the next source', async () => {
    const a = source({ read: async () => { throw new Error('permission denied'); } });
    const b = source({ read: async () => ({ content: 'from B' }) as any });
    await expect(readFirst([a, b], 'x.olx' as OlxRelativePath)).rejects.toThrow('permission denied');
  });
});

describe('grepAll', () => {
  it('re-applies the limit to the merged union (each source only limited itself)', async () => {
    const match = (path: string, line: number): GrepMatch => ({ path, line, content: `${path}:${line}` } as GrepMatch);
    // Each source returned 2 (its own cap); the union of 4 must be re-capped to 2.
    const a = source({ grep: async () => [match('a.olx', 1), match('a.olx', 2)] });
    const b = source({ grep: async () => [match('b.olx', 1), match('b.olx', 2)] });
    const matches = await grepAll([a, b], 'x', { limit: 2 });
    expect(matches.map(m => m.path)).toEqual(['a.olx', 'a.olx']);
  });

  it('deduplicates by path:line across sources', async () => {
    const match = (path: string, line: number): GrepMatch => ({ path, line, content: 'c' } as GrepMatch);
    const a = source({ grep: async () => [match('a.olx', 1)] });
    const b = source({ grep: async () => [match('a.olx', 1), match('b.olx', 3)] });
    const matches = await grepAll([a, b], 'x');
    expect(matches).toEqual([
      { path: 'a.olx', line: 1, content: 'c' },
      { path: 'b.olx', line: 3, content: 'c' },
    ]);
  });
});

// The union no longer diffs against a previous scan — each source enumerates
// only its own origin-distinct refs (StorageProvider.listContent), and the sync
// folds them (syncContentFromStorage). The old "one source reports another's
// files as deleted" hazard is structurally impossible, so its scanSources
// regression test is gone with the function.

describe('namespaceForAcross', () => {
  it('falls through a non-owning source (plain error) to the owner', async () => {
    const a = source({ namespaceFor: async () => { throw new Error('mount mismatch'); } });
    const b = source({ namespaceFor: async () => ({ ns: 'psych' } as any) });
    const result = await namespaceForAcross([a, b], 'x' as LofsRef);
    expect(result.ns).toBe('psych');
  });

  it('propagates the owner’s NamespaceResolutionError instead of masking it', async () => {
    // The owner found the ref but can't resolve a namespace — authoritative.
    // A later source must not get to answer with a mount-mismatch error.
    const a = source({ namespaceFor: async () => { throw new NamespaceResolutionError('no namespace at content root'); } });
    const b = source({ namespaceFor: async () => ({ ns: 'wrong' } as any) });
    await expect(namespaceForAcross([a, b], 'x' as LofsRef)).rejects.toThrow('no namespace at content root');
  });
});
