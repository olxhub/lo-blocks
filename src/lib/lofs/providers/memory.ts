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
import { isContentFile, getExtension } from '@/lib/util/fileTypes';
import type {
  StorageProvider,
  ReadResult,
  UriNode,
  XmlFileInfo,
  XmlScanResult,
  GrepOptions,
  GrepMatch,
} from '../types';
import type { ProvenanceURI, OlxRelativePath, SafeRelativePath } from '../../types';
import { toMemoryProvenanceURI } from '../types';

export class InMemoryStorageProvider implements StorageProvider {
  files: Record<string, string>;
  basePath: string;

  constructor(files: Record<string, string>, basePath = '') {
    this.files = files;
    this.basePath = basePath;
  }

  async read(path: OlxRelativePath): Promise<ReadResult> {
    // Normalize path - remove leading ./ or /
    const normalized = path.replace(/^\.?\//, '');

    if (this.files[normalized] !== undefined) {
      return { content: this.files[normalized], metadata: {}, provenance: toMemoryProvenanceURI(normalized) };
    }

    // Try with basePath prefix
    const withBase = this.basePath ? `${this.basePath}/${normalized}` : normalized;
    if (this.files[withBase] !== undefined) {
      return { content: this.files[withBase], metadata: {}, provenance: toMemoryProvenanceURI(withBase) };
    }

    const availableFiles = Object.keys(this.files).join(', ') || '(none)';
    throw new Error(`File not found: ${path} (available: ${availableFiles})`);
  }

  async exists(path: string): Promise<boolean> {
    const normalized = path.replace(/^\.?\//, '');
    return this.files[normalized] !== undefined;
  }

  async write(): Promise<void> {
    throw new Error('InMemoryStorageProvider is read-only');
  }

  async update(): Promise<void> {
    throw new Error('InMemoryStorageProvider is read-only');
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

      const uri = toMemoryProvenanceURI(filename);
      const ext = getExtension(filename);

      if (previous[uri]) {
        unchanged[uri] = previous[uri];
      } else {
        added[uri] = { id: uri, type: ext, _metadata: {}, content };
      }
    }

    return { added, changed: {}, unchanged, deleted: {} };
  }

  resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): SafeRelativePath {
    // Only handle memory:// provenance — lets the stacked provider fall through
    // to the file provider for file:// URIs.
    if (!baseProvenance.startsWith('memory://')) {
      throw new Error(`Unsupported provenance format: ${baseProvenance}`);
    }

    // Extract directory from base provenance URI and resolve relative to it.
    // e.g., memory://subdir/lesson.olx + "notes.md" → "subdir/notes.md"
    const memoryPath = baseProvenance.slice('memory://'.length);
    const lastSlash = memoryPath.lastIndexOf('/');
    const baseDir = lastSlash >= 0 ? memoryPath.substring(0, lastSlash) : '';
    const joined = baseDir ? `${baseDir}/${relativePath}` : relativePath;

    // Normalize: resolve ., .., strip leading ./
    const segments = joined.split('/');
    const resolved: string[] = [];
    for (const seg of segments) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') { resolved.pop(); continue; }
      resolved.push(seg);
    }

    return resolved.join('/') as SafeRelativePath;
  }

  toProvenanceURI(safePath: SafeRelativePath): ProvenanceURI {
    // Only claim provenance for files that actually exist in this provider.
    // In a stacked provider, this lets the file provider claim provenance
    // for files that aren't in memory.
    const normalized = (safePath as string).replace(/^\.?\//, '');
    if (this.files[normalized] !== undefined) {
      return toMemoryProvenanceURI(safePath);
    }
    // Try with basePath prefix
    if (this.basePath) {
      const withBase = `${this.basePath}/${normalized}`;
      if (this.files[withBase] !== undefined) {
        return toMemoryProvenanceURI(safePath);
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

  /**
   * Search file contents for a pattern in the in-memory filesystem.
   */
  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    const { basePath, include, limit = 1000 } = options;
    const regex = new RegExp(pattern);
    const matches: GrepMatch[] = [];

    // Get files to search
    const files = include
      ? await this.glob(include, basePath)
      : Object.keys(this.files);

    for (const filePath of files) {
      const content = this.files[filePath];
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({
            // Keys come from this.files which is written via write(path: OlxRelativePath, ...)
            path: filePath as OlxRelativePath,
            line: i + 1,
            content: lines[i].trim(),
          });

          if (matches.length >= limit) {
            return matches;
          }
        }
      }
    }

    return matches;
  }

  async delete(): Promise<void> {
    throw new Error('InMemoryStorageProvider is read-only');
  }

  async rename(): Promise<void> {
    throw new Error('InMemoryStorageProvider is read-only');
  }
}
