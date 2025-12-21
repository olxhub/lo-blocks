// src/lib/storage/providers/memory.ts
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

import { isContentFile, getExtension, EXT } from '@/lib/util/fileTypes';

const IMAGE_EXTENSIONS = EXT.image;

export class InMemoryStorageProvider {
  files: Record<string, string>;
  basePath: string;

  constructor(files: Record<string, string>, basePath = '') {
    this.files = files;
    this.basePath = basePath;
  }

  async read(path) {
    // Normalize path - remove leading ./ or /
    const normalized = path.replace(/^\.?\//, '');

    if (this.files[normalized] !== undefined) {
      return this.files[normalized];
    }

    // Try with basePath prefix
    const withBase = this.basePath ? `${this.basePath}/${normalized}` : normalized;
    if (this.files[withBase] !== undefined) {
      return this.files[withBase];
    }

    const availableFiles = Object.keys(this.files).join(', ') || '(none)';
    throw new Error(`File not found: ${path} (available: ${availableFiles})`);
  }

  async exists(path) {
    const normalized = path.replace(/^\.?\//, '');
    return this.files[normalized] !== undefined;
  }

  async write() {
    throw new Error('InMemoryStorageProvider is read-only');
  }

  async update() {
    throw new Error('InMemoryStorageProvider is read-only');
  }

  async listFiles() {
    const children = Object.keys(this.files).map(uri => ({ uri }));
    return { uri: '', children };
  }

  async loadXmlFilesWithStats(previous = {}) {
    const added = {};
    const unchanged = {};

    for (const [filename, content] of Object.entries(this.files)) {
      if (!isContentFile(filename)) continue;

      const uri = `memory://${filename}`;
      const ext = getExtension(filename);

      if (previous[uri]) {
        unchanged[uri] = previous[uri];
      } else {
        added[uri] = { id: uri, type: ext, _metadata: {}, content };
      }
    }

    return { added, changed: {}, unchanged, deleted: {} };
  }

  resolveRelativePath(_baseProvenance, relativePath) {
    return relativePath.replace(/^\.?\//, '');
  }

  async validateImagePath(imagePath) {
    const hasImageExt = IMAGE_EXTENSIONS.some(ext =>
      imagePath.toLowerCase().endsWith(ext)
    );
    return hasImageExt && this.exists(imagePath);
  }
}
