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
import { isContentFile, getExtension, EXT } from '@/lib/util/fileTypes';
import type {
  StorageProvider,
  ReadResult,
  UriNode,
  XmlFileInfo,
  XmlScanResult,
  GrepOptions,
  GrepMatch,
} from '../types';
import type { ProvenanceURI } from '../../types';

const IMAGE_EXTENSIONS = EXT.image;

export class InMemoryStorageProvider implements StorageProvider {
  files: Record<string, string>;
  basePath: string;

  constructor(files: Record<string, string>, basePath = '') {
    this.files = files;
    this.basePath = basePath;
  }

  async read(path: string): Promise<ReadResult> {
    // Normalize path - remove leading ./ or /
    const normalized = path.replace(/^\.?\//, '');

    if (this.files[normalized] !== undefined) {
      return { content: this.files[normalized], metadata: {} };
    }

    // Try with basePath prefix
    const withBase = this.basePath ? `${this.basePath}/${normalized}` : normalized;
    if (this.files[withBase] !== undefined) {
      return { content: this.files[withBase], metadata: {} };
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

      const uri = `memory://${filename}` as ProvenanceURI;
      const ext = getExtension(filename);

      if (previous[uri]) {
        unchanged[uri] = previous[uri];
      } else {
        added[uri] = { id: uri, type: ext, _metadata: {}, content };
      }
    }

    return { added, changed: {}, unchanged, deleted: {} };
  }

  resolveRelativePath(_baseProvenance: ProvenanceURI, relativePath: string): string {
    return relativePath.replace(/^\.?\//, '');
  }

  async validateImagePath(imagePath: string): Promise<boolean> {
    const hasImageExt = IMAGE_EXTENSIONS.some(ext =>
      imagePath.toLowerCase().endsWith(ext)
    );
    return hasImageExt && this.exists(imagePath);
  }

  /**
   * Find files matching a glob pattern in the in-memory filesystem.
   */
  async glob(pattern: string, basePath?: string): Promise<string[]> {
    const files = Object.keys(this.files);
    const searchBase = basePath?.replace(/^\.?\//, '') || '';

    return files.filter(file => {
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
            path: filePath,
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
