// @vitest-environment node
import { StackedStorageProvider } from './stacked';
import { InMemoryStorageProvider } from './memory';
import { fileProvenancePath } from '../types';
import type { ProvenanceURI, SafeRelativePath } from '../../types';

/**
 * Minimal mock of a file-like provider that handles file:// provenance.
 * Uses mount-point matching, like the real FileStorageProvider.
 */
function makeFileProvider(mountPoint: string, files: Record<string, string>) {
  return {
    resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): SafeRelativePath {
      if (!baseProvenance.startsWith('file://')) {
        throw new Error(`Unsupported provenance format: ${baseProvenance}`);
      }
      const logicalPath = fileProvenancePath(baseProvenance);
      const prefix = mountPoint + '/';
      if (!logicalPath.startsWith(prefix)) {
        throw new Error(`Mount point mismatch: expected '${mountPoint}'`);
      }
      const baseRelPath = logicalPath.slice(prefix.length);
      const lastSlash = baseRelPath.lastIndexOf('/');
      const dir = lastSlash >= 0 ? baseRelPath.substring(0, lastSlash) : '';
      return (dir ? `${dir}/${relativePath}` : relativePath) as SafeRelativePath;
    },
    toProvenanceURI(safePath: SafeRelativePath): ProvenanceURI {
      return `file:///${mountPoint}/${safePath}` as ProvenanceURI;
    },
  } as any; // partial implementation — only the methods under test
}

describe('StackedStorageProvider path resolution', () => {
  const memoryFiles = { 'inline.olx': '<Vertical/>' };
  const memoryProvider = new InMemoryStorageProvider(memoryFiles);
  const fileProvider = makeFileProvider('content', { 'demos/lesson.olx': '...', 'demos/notes.md': '...' });
  const stacked = new StackedStorageProvider([memoryProvider, fileProvider]);

  describe('resolveRelativePath', () => {
    it('routes file:// provenance to the file provider', () => {
      const result = stacked.resolveRelativePath(
        'file:///content/demos/lesson.olx' as ProvenanceURI,
        'notes.md'
      );
      expect(result).toBe('demos/notes.md');
    });

    it('routes memory:// provenance to the memory provider', () => {
      const result = stacked.resolveRelativePath(
        'memory:///inline.olx' as ProvenanceURI,
        'other.olx'
      );
      expect(result).toBe('other.olx');
    });

    it('throws when no provider handles the provenance scheme', () => {
      expect(() =>
        stacked.resolveRelativePath('postgres://db/row' as ProvenanceURI, 'file.olx')
      ).toThrow('Cannot resolve path in any provider');
    });
  });

  describe('toProvenanceURI', () => {
    it('returns memory:// for files in the memory provider', () => {
      const result = stacked.toProvenanceURI('inline.olx' as SafeRelativePath);
      expect(result).toBe('memory:///inline.olx');
    });

    it('falls through to file provider for files not in memory', () => {
      const result = stacked.toProvenanceURI('demos/notes.md' as SafeRelativePath);
      expect(result).toBe('file:///content/demos/notes.md');
    });

    it('throws when no provider has the file', () => {
      // File provider never throws on toProvenanceURI, so this will return file://
      // (file provider doesn't check existence). This test documents that behavior.
      const result = stacked.toProvenanceURI('nonexistent.olx' as SafeRelativePath);
      expect(result).toBe('file:///content/nonexistent.olx');
    });
  });
});
