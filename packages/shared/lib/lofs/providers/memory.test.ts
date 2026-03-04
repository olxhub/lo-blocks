// @vitest-environment node
import { InMemoryStorageProvider } from './memory';
import type { ProvenanceURI, SafeRelativePath } from '../../types';

describe('InMemoryStorageProvider', () => {
  const files = {
    'lesson.olx': '<Vertical/>',
    'subdir/notes.md': '# Notes',
    'subdir/deep/file.txt': 'deep content',
  };

  describe('resolveRelativePath', () => {
    const provider = new InMemoryStorageProvider(files);

    it('resolves relative path against memory:/// provenance', () => {
      const result = provider.resolveRelativePath(
        'memory:///subdir/lesson.olx' as ProvenanceURI,
        'notes.md'
      );
      expect(result).toBe('subdir/notes.md');
    });

    it('resolves path at root level', () => {
      const result = provider.resolveRelativePath(
        'memory:///lesson.olx' as ProvenanceURI,
        'other.olx'
      );
      expect(result).toBe('other.olx');
    });

    it('resolves .. segments', () => {
      const result = provider.resolveRelativePath(
        'memory:///subdir/deep/file.olx' as ProvenanceURI,
        '../notes.md'
      );
      expect(result).toBe('subdir/notes.md');
    });

    it('throws for file:// provenance', () => {
      expect(() =>
        provider.resolveRelativePath('file:///some/path.olx' as ProvenanceURI, 'notes.md')
      ).toThrow('Unsupported provenance format');
    });

    it('throws for unknown provenance schemes', () => {
      expect(() =>
        provider.resolveRelativePath('postgres://table/row' as ProvenanceURI, 'notes.md')
      ).toThrow('Unsupported provenance format');
    });
  });

  describe('toProvenanceURI', () => {
    const provider = new InMemoryStorageProvider(files);

    it('returns memory:/// URI for files that exist', () => {
      const result = provider.toProvenanceURI('lesson.olx' as SafeRelativePath);
      expect(result).toBe('memory:///lesson.olx');
    });

    it('returns memory:/// URI for nested files that exist', () => {
      const result = provider.toProvenanceURI('subdir/notes.md' as SafeRelativePath);
      expect(result).toBe('memory:///subdir/notes.md');
    });

    it('throws for files that do not exist', () => {
      expect(() =>
        provider.toProvenanceURI('nonexistent.olx' as SafeRelativePath)
      ).toThrow('File not found in memory provider');
    });

    it('round-trips provenance → resolveRelativePath for plain paths', () => {
      const prov = provider.toProvenanceURI('subdir/notes.md' as SafeRelativePath);
      const resolved = provider.resolveRelativePath(prov, 'deep/file.txt');
      expect(resolved).toBe('subdir/deep/file.txt');
    });

    it('round-trips provenance with spaces in filename', () => {
      const filesWithSpaces = { 'my dir/my file.olx': '<V/>', 'my dir/other.olx': '<V/>' };
      const p = new InMemoryStorageProvider(filesWithSpaces);
      const prov = p.toProvenanceURI('my dir/my file.olx' as SafeRelativePath);
      const resolved = p.resolveRelativePath(prov, 'other.olx');
      expect(resolved).toBe('my dir/other.olx');
    });

    it('round-trips provenance with encoded characters', () => {
      const filesWithSpecial = { 'André/café.olx': '<V/>', 'André/résumé.olx': '<V/>' };
      const p = new InMemoryStorageProvider(filesWithSpecial);
      const prov = p.toProvenanceURI('André/café.olx' as SafeRelativePath);
      const resolved = p.resolveRelativePath(prov, 'résumé.olx');
      expect(resolved).toBe('André/résumé.olx');
    });

    it('finds files via basePath prefix', () => {
      const providerWithBase = new InMemoryStorageProvider(
        { 'base/file.olx': '<Vertical/>' },
        'base'
      );
      const result = providerWithBase.toProvenanceURI('file.olx' as SafeRelativePath);
      expect(result).toBe('memory:///file.olx');
    });
  });
});
