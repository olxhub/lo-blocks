// src/lib/lofs/providers/memory.ts
//
// In-memory storage provider - virtual filesystem for testing and inline content.
//
// Provides a read-only storage provider backed by an in-memory record of files.
// Useful for:
// - Rendering inline OLX content without a real filesystem
// - Testing components that depend on StorageProvider
// - Virtual filesystems for documentation examples
// - Multi-file content where files reference each other via src=""
//

import { minimatch } from 'minimatch';
import { isContentFile, getContentType } from '@/lib/util/fileTypes';
import type {
  StorageProvider,
  ReadResult,
  UriNode,
  XmlFileInfo,
  XmlScanResult,
  GrepOptions,
  GrepMatch,
} from '../../types/storage';
import { type ContentNamespace, toContentNamespace } from '../../types/storage';
import type { ProvenanceURI, OlxRelativePath, SafeRelativePath } from '../../types';
import { toMemoryProvenanceURI } from '../../types/storage';
import { scheme as addressScheme, toLofsAddress } from '../../types/address';
import { resolveRelativeToProvenance } from '../pathResolve';
import { grepContent } from '../searchUtils';

export class InMemoryStorageProvider implements StorageProvider {
  readonly scheme = 'memory' as const;
  readonly namespace: ContentNamespace;
  readonly writable: boolean;
  files: Record<string, string>;
  basePath: string;

  constructor(files: Record<string, string>, basePath = '', options?: { writable?: boolean; namespace?: string }) {
    this.files = files;
    this.basePath = basePath;
    this.writable = options?.writable ?? false;
    this.namespace = toContentNamespace(options?.namespace ?? 'local');
  }

  async read(path: OlxRelativePath): Promise<ReadResult> {
    // Normalize path - remove leading ./ or /
    const normalized = path.replace(/^\.?\//, '');

    if (this.files[normalized] !== undefined) {
      return { content: this.files[normalized], metadata: {}, provenance: toMemoryProvenanceURI(normalized, this.namespace) };
    }

    // Try with basePath prefix
    const withBase = this.basePath ? `${this.basePath}/${normalized}` : normalized;
    if (this.files[withBase] !== undefined) {
      return { content: this.files[withBase], metadata: {}, provenance: toMemoryProvenanceURI(withBase, this.namespace) };
    }

    const availableFiles = Object.keys(this.files).join(', ') || '(none)';
    throw new Error(`File not found: ${path} (available: ${availableFiles})`);
  }

  async exists(path: string): Promise<boolean> {
    const normalized = path.replace(/^\.?\//, '');
    return this.files[normalized] !== undefined;
  }

  async write(path: OlxRelativePath, content: string): Promise<void> {
    if (!this.writable) throw new Error('InMemoryStorageProvider is read-only');
    const normalized = (path as string).replace(/^\.?\//, '');
    this.files[normalized] = content;
  }

  async listFiles(): Promise<UriNode> {
    const children = Object.keys(this.files).map(uri => ({ uri }));
    return { uri: '', children };
  }

  async loadXmlFilesWithStats(
    previous: Record<ProvenanceURI, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    const added: Record<ProvenanceURI, XmlFileInfo> = {};
    const unchanged: Record<ProvenanceURI, XmlFileInfo> = {};

    for (const [filename, content] of Object.entries(this.files)) {
      if (!isContentFile(filename)) continue;

      const uri = toMemoryProvenanceURI(filename, this.namespace);
      const type = getContentType(filename);

      if (previous[uri]) {
        unchanged[uri] = previous[uri];
      } else {
        added[uri] = { id: uri, type, _metadata: {}, content };
      }
    }

    return { added, changed: {}, unchanged, deleted: {} };
  }

  resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): SafeRelativePath {
    if (addressScheme(toLofsAddress(baseProvenance)) !== 'memory') {
      throw new Error(`Unsupported provenance format: ${baseProvenance}`);
    }
    return resolveRelativeToProvenance(baseProvenance, relativePath) as SafeRelativePath;
  }

  toProvenanceURI(safePath: SafeRelativePath): ProvenanceURI {
    // Only claim provenance for files that actually exist in this provider.
    // In a stacked provider, this lets the file provider claim provenance
    // for files that aren't in memory.
    const normalized = (safePath as string).replace(/^\.?\//, '');
    if (this.files[normalized] !== undefined) {
      return toMemoryProvenanceURI(safePath, this.namespace);
    }
    // Try with basePath prefix
    if (this.basePath) {
      const withBase = `${this.basePath}/${normalized}`;
      if (this.files[withBase] !== undefined) {
        return toMemoryProvenanceURI(safePath, this.namespace);
      }
    }
    throw new Error(`File not found in memory provider: ${safePath}`);
  }

  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
    const { isMediaFile } = await import('@/lib/util/fileTypes');
    return isMediaFile(assetPath) && this.exists(assetPath);
  }

  /**
   * Find files matching a glob pattern in the in-memory filesystem.
   */
  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    const files = Object.keys(this.files);
    const searchBase = basePath?.replace(/^\.?\//, '') || '';

    // Keys in this.files are OlxRelativePath (set via write/update which take branded paths)
    return (files as OlxRelativePath[]).filter(file => {
      // Filter by base path first
      if (searchBase && !file.startsWith(searchBase)) {
        return false;
      }

      // Get path relative to base for pattern matching
      const relativePath = searchBase
        ? file.slice(searchBase.length).replace(/^\//, '')
        : file;

      return minimatch(relativePath, pattern);
    });
  }

  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    const { basePath, include, limit = 1000 } = options;
    const filePaths = include
      ? await this.glob(include, basePath)
      : Object.keys(this.files);
    const files = filePaths
      .filter(p => this.files[p])
      .map(p => ({ path: p, content: this.files[p] }));
    return grepContent(files, pattern, limit);
  }

  async delete(path: OlxRelativePath): Promise<void> {
    if (!this.writable) throw new Error('InMemoryStorageProvider is read-only');
    const normalized = (path as string).replace(/^\.?\//, '');
    if (this.files[normalized] === undefined) throw new Error(`File not found: ${path}`);
    delete this.files[normalized];
  }

  async rename(oldPath: OlxRelativePath, newPath: OlxRelativePath): Promise<void> {
    if (!this.writable) throw new Error('InMemoryStorageProvider is read-only');
    const oldNorm = (oldPath as string).replace(/^\.?\//, '');
    const newNorm = (newPath as string).replace(/^\.?\//, '');
    if (this.files[oldNorm] === undefined) throw new Error(`File not found: ${oldPath}`);
    this.files[newNorm] = this.files[oldNorm];
    delete this.files[oldNorm];
  }
}
