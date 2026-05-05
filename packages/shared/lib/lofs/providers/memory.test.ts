// @vitest-environment node
import { InMemoryStorageProvider } from './memory';
import type { LofsRef, SafeRelativePath } from '../../types';

describe('InMemoryStorageProvider', () => {
  const files = {
    'lesson.olx': '<Vertical/>',
    'subdir/notes.md': '# Notes',
    'subdir/deep/file.txt': 'deep content',
  };

  describe('resolveRelativePath', () => {
    const provider = new InMemoryStorageProvider(files);

    it('resolves relative path against memory:local:// provenance', () => {
      const result = provider.resolveRelativePath(
        'memory:local://subdir/lesson.olx' as LofsRef,
        'notes.md'
      );
      expect(result).toBe('subdir/notes.md');
    });

    it('resolves path at root level', () => {
      const result = provider.resolveRelativePath(
        'memory:local://lesson.olx' as LofsRef,
        'other.olx'
      );
      expect(result).toBe('other.olx');
    });

    it('resolves .. segments', () => {
      const result = provider.resolveRelativePath(
        'memory:local://subdir/deep/file.olx' as LofsRef,
        '../notes.md'
      );
      expect(result).toBe('subdir/notes.md');
    });

    it('throws for file: provenance', () => {
      expect(() =>
        provider.resolveRelativePath('file:content://some/path.olx' as LofsRef, 'notes.md')
      ).toThrow('Unsupported provenance format');
    });

    it('throws for unknown provenance schemes', () => {
      expect(() =>
        provider.resolveRelativePath('postgres://table/row' as LofsRef, 'notes.md')
      ).toThrow('Unsupported provenance format');
    });
  });

  describe('toLofsRef', () => {
    const provider = new InMemoryStorageProvider(files);

    it('returns memory:local:// URI for files that exist', () => {
      const result = provider.toLofsRef('lesson.olx' as SafeRelativePath);
      expect(result).toBe('memory:local://lesson.olx');
    });

    it('returns memory:local:// URI for nested files that exist', () => {
      const result = provider.toLofsRef('subdir/notes.md' as SafeRelativePath);
      expect(result).toBe('memory:local://subdir/notes.md');
    });

    it('throws for files that do not exist', () => {
      expect(() =>
        provider.toLofsRef('nonexistent.olx' as SafeRelativePath)
      ).toThrow('File not found in memory provider');
    });

    it('round-trips provenance → resolveRelativePath for plain paths', () => {
      const prov = provider.toLofsRef('subdir/notes.md' as SafeRelativePath);
      const resolved = provider.resolveRelativePath(prov, 'deep/file.txt');
      expect(resolved).toBe('subdir/deep/file.txt');
    });

    it('round-trips provenance with spaces in filename', () => {
      const filesWithSpaces = { 'my dir/my file.olx': '<V/>', 'my dir/other.olx': '<V/>' };
      const p = new InMemoryStorageProvider(filesWithSpaces);
      const prov = p.toLofsRef('my dir/my file.olx' as SafeRelativePath);
      const resolved = p.resolveRelativePath(prov, 'other.olx');
      expect(resolved).toBe('my dir/other.olx');
    });

    it('round-trips provenance with encoded characters', () => {
      const filesWithSpecial = { 'André/café.olx': '<V/>', 'André/résumé.olx': '<V/>' };
      const p = new InMemoryStorageProvider(filesWithSpecial);
      const prov = p.toLofsRef('André/café.olx' as SafeRelativePath);
      const resolved = p.resolveRelativePath(prov, 'résumé.olx');
      expect(resolved).toBe('André/résumé.olx');
    });

    it('finds files via basePath prefix', () => {
      const providerWithBase = new InMemoryStorageProvider(
        { 'base/file.olx': '<Vertical/>' },
        'base'
      );
      const result = providerWithBase.toLofsRef('file.olx' as SafeRelativePath);
      expect(result).toBe('memory:local://file.olx');
    });
  });
});
