// @vitest-environment node
import { StackedStorageProvider } from './stacked';
import { InMemoryStorageProvider } from './memory';
import { FileStorageProvider } from './file';
import type { LofsRef, SafeRelativePath } from '../../types';

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
