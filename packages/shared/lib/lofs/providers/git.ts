// src/lib/lofs/providers/git.ts
//
// Git storage provider - version-controlled content access.
//
// Reads content from a local git repository (working tree or specific ref).
// Uses isomorphic-git (pure JS, no native dependencies).
//
// PoC scope: read-only from local clone.
//   - read(): reads from working tree (or pinned ref via readBlob)
//   - loadXmlFilesWithStats(): walks working tree, uses blob OIDs for change detection
//   - glob()/grep(): delegates to working tree filesystem
//   - Provenance: git://<remote-or-path>/<file-path>
//
// Write operations throw (writable=false).
//
import path from 'path';
import git from 'isomorphic-git';
import type { ProvenanceURI, OlxRelativePath, SafeRelativePath, JSONValue } from '../../types';
import { isContentFile, getContentType } from '@/lib/util/fileTypes';
import { minimatch } from 'minimatch';
import { scheme as addressScheme, toLofsAddress } from '../../types/address';
import { resolveRelativeToProvenance } from '../pathResolve';
import { grepContent } from '../searchUtils';
import type {
  StorageProvider,
  ContentNamespace,
  XmlFileInfo,
  XmlScanResult,
  UriNode,
  ReadResult,
  WriteOptions,
  GrepOptions,
  GrepMatch,
} from '../../types/storage';
import { toContentNamespace, toGitProvenanceURI } from '../../types/storage';

export interface GitStorageProviderOptions {
  /** Namespace for this provider (default: derived from remote URL or 'local'). */
  namespace?: string;
  /** Git ref to read from (default: 'HEAD' — reads working tree). */
  ref?: string;
  /** Mount ID for provenance URIs — a slash-free identifier (default: repo basename). */
  mountPoint?: string;
}

export class GitStorageProvider implements StorageProvider {
  readonly scheme = 'git' as const;
  readonly namespace: ContentNamespace;
  readonly writable = false;

  /** Absolute path to the git repository root. */
  readonly repoDir: string;
  /** Git ref to read from. 'HEAD' reads the working tree. */
  readonly ref: string;
  /** Mount ID for provenance URIs. */
  readonly mountPoint: string;
  /** Node.js fs module — loaded lazily. */
  private _fs: typeof import('fs') | null = null;

  constructor(repoDir: string, options: GitStorageProviderOptions = {}) {
    this.repoDir = path.resolve(repoDir);
    this.ref = options.ref ?? 'HEAD';
    this.mountPoint = options.mountPoint ?? path.basename(this.repoDir);
    this.namespace = toContentNamespace(options.namespace ?? 'local');
  }

  private async getFs() {
    if (!this._fs) {
      this._fs = await import('fs');
    }
    return this._fs;
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  async read(filePath: OlxRelativePath): Promise<ReadResult> {
    const fs = await this.getFs();
    const fullPath = path.join(this.repoDir, filePath);

    // Read from working tree
    try {
      const content = await fs.promises.readFile(fullPath, 'utf-8');

      // Get the blob OID for metadata (change detection)
      let oid: string | undefined;
      try {
        const blob = await git.hashBlob({ object: content });
        oid = blob.oid;
      } catch {
        // Fallback: use file stats
      }

      return {
        content,
        metadata: oid ? { oid } : {},
        provenance: toGitProvenanceURI(this.mountPoint, filePath),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Scan for content files
  // ---------------------------------------------------------------------------

  async loadXmlFilesWithStats(
    previous: Record<ProvenanceURI, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    const fs = await this.getFs();

    const found: Record<ProvenanceURI, boolean> = {};
    const added: Record<ProvenanceURI, XmlFileInfo> = {};
    const changed: Record<ProvenanceURI, XmlFileInfo> = {};
    const unchanged: Record<ProvenanceURI, XmlFileInfo> = {};

    // Walk the working tree
    const walk = async (relDir: string) => {
      const absDir = path.join(this.repoDir, relDir);
      const entries = await fs.promises.readdir(absDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(relPath);
        } else if (entry.isFile() && isContentFile(relPath)) {
          const uri = toGitProvenanceURI(this.mountPoint, relPath);
          found[uri] = true;

          const content = await fs.promises.readFile(
            path.join(this.repoDir, relPath),
            'utf-8'
          );

          // Compute blob hash for change detection
          const blob = await git.hashBlob({ object: content });
          const type = getContentType(relPath);

          const prev = previous[uri];
          if (prev) {
            const prevMeta = prev._metadata as { oid?: string } | null;
            if (prevMeta?.oid !== blob.oid) {
              changed[uri] = {
                id: uri,
                type,
                _metadata: { oid: blob.oid } as unknown as JSONValue,
                content,
              };
            } else {
              unchanged[uri] = prev;
            }
          } else {
            added[uri] = {
              id: uri,
              type,
              _metadata: { oid: blob.oid } as unknown as JSONValue,
              content,
            };
          }
        }
      }
    };

    await walk('');

    const deleted: Record<ProvenanceURI, XmlFileInfo> = {};
    for (const id of Object.keys(previous) as ProvenanceURI[]) {
      if (!found[id]) {
        deleted[id] = previous[id];
      }
    }

    return { added, changed, unchanged, deleted };
  }

  // ---------------------------------------------------------------------------
  // File listing
  // ---------------------------------------------------------------------------

  async listFiles(): Promise<UriNode> {
    const fs = await this.getFs();

    const walk = async (relDir: string): Promise<UriNode> => {
      const absDir = path.join(this.repoDir, relDir);
      const entries = await fs.promises.readdir(absDir, { withFileTypes: true });
      const children: UriNode[] = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          children.push(await walk(relPath));
        } else if (entry.isFile() && isContentFile(relPath)) {
          children.push({ uri: relPath });
        }
      }
      return { uri: relDir, children };
    };

    return walk('');
  }

  // ---------------------------------------------------------------------------
  // Glob / Grep
  // ---------------------------------------------------------------------------

  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    const fs = await this.getFs();
    const results: OlxRelativePath[] = [];

    const walk = async (relDir: string) => {
      const absDir = path.join(this.repoDir, relDir);
      let entries;
      try {
        entries = await fs.promises.readdir(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(relPath);
        } else if (entry.isFile()) {
          // Match against pattern relative to basePath
          const matchPath = basePath
            ? relPath.slice(basePath.length).replace(/^\//, '')
            : relPath;
          if (minimatch(matchPath, pattern)) {
            results.push(relPath as OlxRelativePath);
          }
        }
      }
    };

    await walk(basePath ?? '');
    return results;
  }

  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    const { basePath, include, limit = 1000 } = options;
    const fs = await this.getFs();
    const filePaths = include
      ? await this.glob(include, basePath)
      : await this.glob('**/*', basePath);
    const files: Array<{ path: string; content: string }> = [];
    for (const filePath of filePaths) {
      if (!isContentFile(filePath)) continue;
      try {
        const content = await fs.promises.readFile(
          path.join(this.repoDir, filePath), 'utf-8'
        );
        files.push({ path: filePath, content });
      } catch {
        // Skip unreadable files
      }
    }
    return grepContent(files, pattern, limit);
  }

  // ---------------------------------------------------------------------------
  // Path resolution / provenance
  // ---------------------------------------------------------------------------

  resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): SafeRelativePath {
    if (addressScheme(toLofsAddress(baseProvenance)) !== 'git') {
      throw new Error(`Unsupported provenance format: ${baseProvenance}`);
    }
    return resolveRelativeToProvenance(baseProvenance, relativePath) as SafeRelativePath;
  }

  toProvenanceURI(safePath: SafeRelativePath): ProvenanceURI {
    return toGitProvenanceURI(this.mountPoint, safePath);
  }

  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
    try {
      const { isMediaFile } = await import('@/lib/util/fileTypes');
      if (!isMediaFile(assetPath)) return false;
      const fs = await this.getFs();
      const fullPath = path.join(this.repoDir, assetPath);
      const stat = await fs.promises.stat(fullPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Write operations (not supported)
  // ---------------------------------------------------------------------------

  async write(_path: OlxRelativePath, _content: string, _options?: WriteOptions): Promise<void> {
    throw new Error('GitStorageProvider is read-only');
  }

  async delete(_path: OlxRelativePath): Promise<void> {
    throw new Error('GitStorageProvider is read-only');
  }

  async rename(_oldPath: OlxRelativePath, _newPath: OlxRelativePath): Promise<void> {
    throw new Error('GitStorageProvider is read-only');
  }
}
