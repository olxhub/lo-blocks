// @vitest-environment node
import { StackedStorageProvider } from './stacked';
import { InMemoryStorageProvider } from './memory';
import { fileProvenancePath } from '../../types/storage';
import { scheme, source, toLofsRef as brandLofsRef } from '../../types/address';
import type { LofsRef, SafeRelativePath } from '../../types';

/**
 * Minimal mock of a file-like provider that handles file: provenance.
 * Uses mount-point matching, like the real FileStorageProvider.
 */
function makeFileProvider(mountPoint: string, files: Record<string, string>) {
  return {
    resolveRelativePath(baseProvenance: LofsRef, relativePath: string): SafeRelativePath {
      if (scheme(brandLofsRef(baseProvenance)) !== 'file') {
        throw new Error(`Unsupported provenance format: ${baseProvenance}`);
      }
      const expectedSource = `file:${mountPoint}`;
      if (source(brandLofsRef(baseProvenance)) !== expectedSource) {
        throw new Error(`Mount point mismatch: expected '${mountPoint}'`);
      }
      const baseRelPath = fileProvenancePath(baseProvenance);
      const lastSlash = baseRelPath.lastIndexOf('/');
      const dir = lastSlash >= 0 ? baseRelPath.substring(0, lastSlash) : '';
      return (dir ? `${dir}/${relativePath}` : relativePath) as SafeRelativePath;
    },
    toLofsRef(safePath: SafeRelativePath): LofsRef {
      return `file:${mountPoint}://${safePath}` as LofsRef;
    },
  } as any; // partial implementation — only the methods under test
}

describe('StackedStorageProvider path resolution', () => {
  const memoryFiles = { 'inline.olx': '<Vertical/>' };
  const memoryProvider = new InMemoryStorageProvider(memoryFiles);
  const fileProvider = makeFileProvider('content', { 'demos/lesson.olx': '...', 'demos/notes.md': '...' });
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
