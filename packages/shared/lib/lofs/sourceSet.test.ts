// @vitest-environment node
//
// Union operations over a set of source providers (lib/lofs/sourceSet.ts):
// the merge/routing semantics of the read/compile union, now explicit
// functions rather than a stacked provider.

import { readFirst, grepAll, scanSources, namespaceForAcross } from './sourceSet';
import { FileStorageProvider } from './providers/file';
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

describe('scanSources', () => {
  // Regression: each source receives the FULL previous snapshot (all mounts'
  // refs). A source must diff only against its own refs — otherwise every
  // source reports the others' files as deleted and the merge destroys the index.
  it('does not report other sources’ files as deleted on re-scan', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    const dirA = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-sourceset-a-'));
    const dirB = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-sourceset-b-'));
    try {
      await fs.writeFile(path.join(dirA, 'a.olx'), '<A/>');
      await fs.writeFile(path.join(dirB, 'b.olx'), '<B/>');

      const sources = [
        new FileStorageProvider(dirA, 'mountA'),
        new FileStorageProvider(dirB, 'mountB'),
      ];

      const first = await scanSources(sources);
      expect(Object.keys(first.added).sort()).toEqual([
        'file:mountA://a.olx',
        'file:mountB://b.olx',
      ]);

      // Re-scan with the merged previous snapshot: nothing changed.
      const second = await scanSources(sources, first.added);
      expect(Object.keys(second.deleted)).toEqual([]);
      expect(Object.keys(second.added)).toEqual([]);
      expect(Object.keys(second.changed)).toEqual([]);
      expect(Object.keys(second.unchanged).sort()).toEqual([
        'file:mountA://a.olx',
        'file:mountB://b.olx',
      ]);
    } finally {
      await fs.rm(dirA, { recursive: true, force: true });
      await fs.rm(dirB, { recursive: true, force: true });
    }
  });
});

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
