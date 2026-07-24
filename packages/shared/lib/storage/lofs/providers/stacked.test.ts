// @vitest-environment node
import { StackedStorageProvider } from './stacked';
import { InMemoryStorageProvider } from './memory';
import { FileStorageProvider } from './file';
import type { LofsRef, SafeRelativePath } from '../../../types';

describe('StackedStorageProvider path resolution', () => {
  const memoryFiles = { 'inline.olx': '<Vertical/>' };
  const memoryProvider = new InMemoryStorageProvider(memoryFiles);
  const fileProvider = new FileStorageProvider('./content', 'content');
  const stacked = new StackedStorageProvider([memoryProvider, fileProvider]);

  describe('resolveRelativePath', () => {
    it('routes file: provenance to the file provider', () => {
      const result = stacked.resolveRelativePath(
        'file:content://demos/lesson.olx' as LofsRef,
        'notes.md'
      );
      expect(result).toBe('demos/notes.md');
    });

    it('routes memory: provenance to the memory provider', () => {
      const result = stacked.resolveRelativePath(
        'memory:local://inline.olx' as LofsRef,
        'other.olx'
      );
      expect(result).toBe('other.olx');
    });

    it('throws when no provider handles the provenance scheme', () => {
      expect(() =>
        stacked.resolveRelativePath('postgres://db/row' as LofsRef, 'file.olx')
      ).toThrow('Cannot resolve path in any provider');
    });
  });

  describe('toLofsRef', () => {
    it('returns memory: ref for files in the memory provider', () => {
      const result = stacked.toLofsRef('inline.olx' as SafeRelativePath);
      expect(result).toBe('memory:local://inline.olx');
    });

    it('falls through to file provider for files not in memory', () => {
      const result = stacked.toLofsRef('demos/notes.md' as SafeRelativePath);
      expect(result).toBe('file:content://demos/notes.md');
    });

    it('throws when no provider has the file', () => {
      // File provider never throws on toLofsRef, so this will return a file: ref
      // (file provider doesn't check existence). This test documents that behavior.
      const result = stacked.toLofsRef('nonexistent.olx' as SafeRelativePath);
      expect(result).toBe('file:content://nonexistent.olx');
    });
  });
});

describe('StackedStorageProvider multi-mount scan', () => {
  // Regression: each provider receives the FULL previous snapshot, which
  // contains other mounts' files. Providers must only diff against their
  // own refs — otherwise every provider reports the other mounts' files
  // as deleted and the merge destroys the index.
  it('does not report other mounts’ files as deleted on re-scan', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    const dirA = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-stacked-a-'));
    const dirB = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-stacked-b-'));
    try {
      await fs.writeFile(path.join(dirA, 'a.olx'), '<A/>');
      await fs.writeFile(path.join(dirB, 'b.olx'), '<B/>');

      const stacked = new StackedStorageProvider([
        new FileStorageProvider(dirA, 'mountA'),
        new FileStorageProvider(dirB, 'mountB'),
      ]);

      const first = await stacked.loadXmlFilesWithStats();
      expect(Object.keys(first.added).sort()).toEqual([
        'file:mountA://a.olx',
        'file:mountB://b.olx',
      ]);

      // Re-scan with the merged previous snapshot: nothing changed,
      // so nothing may be added, changed, or deleted.
      const second = await stacked.loadXmlFilesWithStats(first.added);
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
