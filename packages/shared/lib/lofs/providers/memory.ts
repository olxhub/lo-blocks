// packages/shared/lib/lofs/providers/memory.ts
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
import { isContentFile, isMediaFile, getExtension } from '@/lib/util/fileTypes';
import type {
  StorageProvider,
  ReadResult,
  UriNode,
  XmlFileInfo,
  XmlScanResult,
  GrepOptions,
  GrepMatch,
} from '../../types/storage';
import type { LofsRef, OlxRelativePath, SafeRelativePath } from '../../types';
import { type ContentNamespace, PLACEHOLDER_NS } from '../../types/id-grammar';
import { toMemoryRef, provenancePath } from '../../types/storage';
import { scheme, withVersion, toLofsRef as brandLofsRef, toLofsCanonical, toLofsVersion } from '../../types/address';
import { hashContent } from '../../util';

export class InMemoryStorageProvider implements StorageProvider {
  files: Record<string, string>;
  basePath: string;
  ns: ContentNamespace;

  /**
   * @param files - Virtual filesystem: { 'path.olx': '<OLX>...' }
   * @param basePath - Optional prefix tried when resolving reads
   * @param options.ns - Content namespace for all files in this provider.
   *   Memory sources hold transient content (editor buffers, tests, inline
   *   parses), so the whole provider is one namespace. Defaults to
   *   PLACEHOLDER_NS until callers (editor, RenderOLX) thread real
   *   namespaces through.
   */
  constructor(files: Record<string, string>, basePath = '', { ns = PLACEHOLDER_NS }: { ns?: ContentNamespace } = {}) {
    this.files = files;
    this.basePath = basePath;
    this.ns = ns;
  }

  async namespaceFor(_ref: LofsRef): Promise<ContentNamespace> {
    return this.ns;
  }

  async read(path: OlxRelativePath): Promise<ReadResult> {
    // Normalize path - remove leading ./ or /
    const normalized = path.replace(/^\.?\//, '');

    if (this.files[normalized] !== undefined) {
      const content = this.files[normalized];
      const ref = toMemoryRef(normalized);
      const ver = toLofsVersion(await hashContent(content));
      return { content, metadata: {}, provenance: toLofsCanonical(withVersion(ref, ver)) };
    }

    // Try with basePath prefix
    const withBase = this.basePath ? `${this.basePath}/${normalized}` : normalized;
    if (this.files[withBase] !== undefined) {
      const content = this.files[withBase];
      const ref = toMemoryRef(withBase);
      const ver = toLofsVersion(await hashContent(content));
      return { content, metadata: {}, provenance: toLofsCanonical(withVersion(ref, ver)) };
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
    previous: Record<LofsRef, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    const added: Record<LofsRef, XmlFileInfo> = {};
    const changed: Record<LofsRef, XmlFileInfo> = {};
    const unchanged: Record<LofsRef, XmlFileInfo> = {};
    const found = new Set<LofsRef>();

    for (const [filename, content] of Object.entries(this.files)) {
      if (!isContentFile(filename)) continue;

      const ref = toMemoryRef(filename);
      const ext = getExtension(filename);
      found.add(ref);

      const ver = toLofsVersion(await hashContent(content));
      const id = toLofsCanonical(withVersion(ref, ver));

      const prev = previous[ref];
      if (!prev) {
        added[ref] = { id, type: ext, _metadata: {}, content };
      } else if (prev.id !== id) {
        // Content hash changed — re-read needed
        changed[ref] = { id, type: ext, _metadata: {}, content };
      } else {
        unchanged[ref] = prev;
      }
    }

    // Files in previous but no longer in this.files. Only check memory: refs —
    // in a StackedStorageProvider, previous contains refs from all providers,
    // and reporting file: refs as deleted would mask the file provider's results.
    const deleted: Record<LofsRef, XmlFileInfo> = {};
    for (const ref of Object.keys(previous) as LofsRef[]) {
      if (!found.has(ref) && scheme(brandLofsRef(ref)) === 'memory') {
        deleted[ref] = previous[ref];
      }
    }

    return { added, changed, unchanged, deleted };
  }

  resolveRelativePath(baseProvenance: LofsRef, relativePath: string): SafeRelativePath {
    // Only handle memory: provenance — lets the stacked provider fall through
    // to the file provider for file: refs.
    if (scheme(brandLofsRef(baseProvenance)) !== 'memory') {
      throw new Error(`Unsupported provenance format: ${baseProvenance}`);
    }

    // Extract directory from base provenance URI and resolve relative to it.
    // e.g., memory:local://subdir/lesson.olx + "notes.md" → "subdir/notes.md"
    const memoryPath = provenancePath(baseProvenance);
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

  toLofsRef(safePath: SafeRelativePath): LofsRef {
    // Only claim provenance for files that actually exist in this provider.
    // In a stacked provider, this lets the file provider claim provenance
    // for files that aren't in memory.
    const normalized = (safePath as string).replace(/^\.?\//, '');
    if (this.files[normalized] !== undefined) {
      return toMemoryRef(safePath);
    }
    // Try with basePath prefix
    if (this.basePath) {
      const withBase = `${this.basePath}/${normalized}`;
      if (this.files[withBase] !== undefined) {
        return toMemoryRef(safePath);
      }
    }
    throw new Error(`File not found in memory provider: ${safePath}`);
  }

  toRelativePath(uri: LofsRef): OlxRelativePath {
    return provenancePath(uri) as OlxRelativePath;
  }

  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
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
