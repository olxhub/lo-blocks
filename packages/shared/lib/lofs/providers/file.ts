// packages/shared/lib/lofs/providers/file.ts
//
// File storage provider - local filesystem access for Learning Observer.
//
// Primary storage implementation for development and local deployments.
// Reads content from a base directory (default: ./content) with security
// sandboxing to prevent path traversal attacks.
//
import path from 'path';
import { glob as globLib } from 'glob';
import YAML from 'yaml';
import pegExts from '../../../generated/pegExtensions.json' assert { type: 'json' };
import type { LofsRef, OlxRelativePath, SafeRelativePath, FileSystemPath } from '../../types';
import { type ContentNamespace, validateContentNamespace, asContentNamespace } from '../../types/id-grammar';
import { EXT, isMediaFile } from '@/lib/util/fileTypes';
import { windowsToPosix } from '@/lib/util/posixPath';
import {
  type StorageProvider,
  type XmlFileInfo,
  type XmlScanResult,
  type FileSelection,
  type UriNode,
  type ReadResult,
  type WriteOptions,
  type GrepOptions,
  type GrepMatch,
  type NamespaceResolution,
  VersionConflictError,
  NamespaceResolutionError,
  toFileRef,
  fileProvenancePath,
} from '../../types/storage';
import { source, scheme, withVersion, withoutVersion, toLofsRef as brandLofsRef, toLofsVersion, toLofsCanonical } from '../../types/address';
import { fileTypes } from '../fileTypes';
import type { JSONValue } from '../../types';

/** Content file extensions recognized by the storage provider. */
const CONTENT_EXTENSIONS = ['.xml', '.olx', '.md', '.cast', ...pegExts.map(e => `.${e}`), ...EXT.mermaid.map(ext => `.${ext}`)];

/**
 * FileStorageProvider-specific metadata structure.
 * Extends the generic ProviderMetadata type with filesystem-specific fields.
 *
 * Note: fs.Stats is a class instance, but all its properties are JSON-serializable
 * (numbers, strings, booleans). We cast to JSONValue when storing in _metadata.
 */
interface FileMetadata {
  stat: any; // fs.Stats - properties are all numbers/strings
}

/*
 * =============================================================================
 * Path Security System
 * =============================================================================
 *
 * CURRENT STATE (Hardcoded):
 * --------------------------
 * This module provides secure path resolution with symlink handling. Currently,
 * allowed directories are hardcoded for local development. This is intentional -
 * we're being conservative until we have a proper config system.
 *
 * FUTURE DIRECTION (Provider-based):
 * ----------------------------------
 * The allowed directories should eventually be configured per storage provider,
 * not globally. The system will support a hierarchy of providers:
 *
 *   Priority | Provider                | Read | Write | Example
 *   ---------|-------------------------|------|-------|------------------------
 *   4 (high) | In-memory / dev overlay | ✓    | ✓     | Live editing state
 *   3        | User content            | ✓    | ✓     | ~/lo-blocks-content/
 *   2        | Institution content     | ✓    | role  | University DB
 *   1 (low)  | System content          | ✓    | ✗     | project content/, blocks/
 *
 * Content IDs resolve top-down (check provider 4, then 3, then 2, then 1).
 * Write permissions depend on the provider and user role.
 *
 * TEMPORARY WORKAROUND:
 * ---------------------
 * The OLX_CONTENT_DIR environment variable can override the content directory.
 * This is used by tests and as a stopgap until the config system exists.
 *
 * When the config system is implemented:
 * - Move getAllowedReadDirs / getAllowedWriteDirs to provider configuration
 * - Each provider specifies its own allowed paths
 * - User-specific providers (like ~/lo-blocks-content/) are configured per-user
 * - Role-based write permissions for shared providers (institution content)
 * - Remove OLX_CONTENT_DIR workaround
 *
 * SECURITY MODEL:
 * ---------------
 * 1. Path traversal prevention: Reject paths with '..' that escape base directory
 * 2. Null byte rejection: Prevent path truncation attacks
 * 3. Symlink resolution: Use realpath() to get canonical paths
 * 4. Allowlist validation: Canonical path must be within allowed directories
 * 5. Read vs Write separation: Writes are more restricted than reads
 * 6. Symlinks rejected for writes: Prevent unexpected write targets
 *
 * =============================================================================
 */

// TODO: Move to provider configuration when config system is implemented
const PROJECT_ROOT = process.cwd();

/**
 * Get allowed directories for read operations.
 * Includes OLX_CONTENT_DIR if set (used by tests and custom content locations).
 *
 * NOTE: Grammar directories here should match GRAMMAR_DIRS in packages/shared/lib/grammarDirs.ts
 * for the docs API to discover all grammars.
 */
function getAllowedReadDirs(): string[] {
  const dirs = [
    path.join(PROJECT_ROOT, 'packages/shared/components/blocks'),
    path.join(PROJECT_ROOT, 'packages/shared/lib/template'),  // For template grammar
    path.join(PROJECT_ROOT, 'packages/shared/lib/stateLanguage'),  // For expression grammar
    path.join(PROJECT_ROOT, 'packages/shared/lib/util/calc'),  // For calc grammar
    path.join(PROJECT_ROOT, 'content'),
  ];
  // Support custom content directory via environment variable
  // This is used by tests and will eventually be replaced by provider config
  if (process.env.OLX_CONTENT_DIR) {
    dirs.push(path.resolve(process.env.OLX_CONTENT_DIR));
  }
  return dirs;
}

/**
 * Get allowed directories for write operations.
 * Includes OLX_CONTENT_DIR if set.
 */
function getAllowedWriteDirs(): string[] {
  const dirs = [
    path.join(PROJECT_ROOT, 'content'),
  ];
  if (process.env.OLX_CONTENT_DIR) {
    dirs.push(path.resolve(process.env.OLX_CONTENT_DIR));
  }
  return dirs;
}

/**
 * Check if a canonical path is within any of the allowed directories.
 */
function isPathAllowed(canonicalPath: string, allowedDirs: string[]): boolean {
  return allowedDirs.some(dir => {
    const relative = path.relative(dir, canonicalPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  });
}

/**
 * Resolve a path for reading, with security checks.
 * Allows symlinks if the target is within allowed read directories.
 *
 * Allowed read directories (hardcoded for now):
 * - src/components/blocks/ (block documentation, examples)
 * - content/ (course content)
 *
 * @param baseDir - Base directory for resolving relative paths
 * @param relPath - Relative path to resolve
 * @returns Resolved path (follows symlinks internally but returns logical path)
 * @throws Error if path escapes allowed directories or contains null bytes
 */
export async function resolveSafeReadPath(baseDir: string, relPath: string): Promise<FileSystemPath> {
  if (typeof relPath !== 'string' || relPath.includes('\0')) {
    throw new Error('Invalid path: null bytes not allowed');
  }

  const fs = await import('fs/promises');

  // Resolve to full path
  const full = path.resolve(baseDir, relPath);

  // Check logical path doesn't escape baseDir via '..'
  const relative = path.relative(baseDir, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid path: escapes base directory');
  }

  // Get canonical path (resolves all symlinks)
  let canonicalPath: string;
  try {
    canonicalPath = await fs.realpath(full);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // File doesn't exist - return logical path, caller will handle ENOENT
      return full as FileSystemPath;
    }
    throw err;
  }

  // Verify canonical path is within allowed read directories
  if (!isPathAllowed(canonicalPath, getAllowedReadDirs())) {
    throw new Error('Invalid path: resolves outside allowed directories');
  }

  return full as FileSystemPath;
}

/**
 * Resolve a path for writing, with security checks.
 * Rejects all symlinks to prevent unexpected write targets.
 *
 * Allowed write directories (hardcoded for now):
 * - content/ (course content only)
 *
 * @param baseDir - Base directory for resolving relative paths
 * @param relPath - Relative path to resolve
 * @returns Resolved path
 * @throws Error if path contains symlinks, escapes allowed directories, or contains null bytes
 */
export async function resolveSafeWritePath(baseDir: string, relPath: string): Promise<FileSystemPath> {
  if (typeof relPath !== 'string' || relPath.includes('\0')) {
    throw new Error('Invalid path: null bytes not allowed');
  }

  const fs = await import('fs/promises');

  // Resolve to full path
  const full = path.resolve(baseDir, relPath);

  // Check logical path doesn't escape baseDir via '..'
  const relative = path.relative(baseDir, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid path: escapes base directory');
  }

  // Check for symlinks - reject any symlinks for write operations
  // We check the path by comparing logical vs canonical
  let canonicalPath: string;
  try {
    canonicalPath = await fs.realpath(full);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // File doesn't exist yet (creating new file)
      // Check parent directory exists and is within allowed dirs
      const parentDir = path.dirname(full);
      try {
        const canonicalParent = await fs.realpath(parentDir);
        if (!isPathAllowed(canonicalParent, getAllowedWriteDirs())) {
          throw new Error('Invalid path: parent directory outside allowed write directories');
        }
        // Check parent path has no symlinks
        if (canonicalParent !== parentDir) {
          throw new Error('Invalid path: symlinks not allowed for write operations');
        }
      } catch (parentErr: any) {
        if (parentErr.code === 'ENOENT') {
          throw new Error('Invalid path: parent directory does not exist');
        }
        throw parentErr;
      }
      return full as FileSystemPath;
    }
    throw err;
  }

  // Reject if path contains symlinks
  if (canonicalPath !== full) {
    throw new Error('Invalid path: symlinks not allowed for write operations');
  }

  // Verify path is within allowed write directories
  if (!isPathAllowed(full, getAllowedWriteDirs())) {
    throw new Error('Invalid path: outside allowed write directories');
  }

  return full as FileSystemPath;
}

/**
 * @deprecated Use resolveSafeReadPath or resolveSafeWritePath instead.
 *
 * Legacy function maintained for backwards compatibility during migration.
 * Will be removed once all callers are updated.
 */
export async function resolveSafePath(
  baseDir: string,
  relPath: string,
  { allowSymlinks = false }: { allowSymlinks?: boolean | 'file' } = {}
): Promise<string> {
  // For backwards compatibility, delegate to read path if symlinks allowed,
  // otherwise use stricter write path logic
  if (allowSymlinks) {
    return resolveSafeReadPath(baseDir, relPath);
  }

  // Original strict behavior - no symlinks, must stay within baseDir
  if (typeof relPath !== 'string' || relPath.includes('\0')) {
    throw new Error('Invalid path');
  }

  const fs = await import('fs/promises');
  const full = path.resolve(baseDir, relPath);
  const relative = path.relative(baseDir, full);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid path');
  }

  const stats = await fs.lstat(full).catch(() => null);
  if (stats && stats.isSymbolicLink()) {
    throw new Error('Symlinks not allowed');
  }

  return full;
}

/**
 * Build a tree of XML/OLX files from a content directory.
 * Server-only - uses Node.js fs module.
 */
async function listFileTree(
  selection: FileSelection = {},
  baseDir = './content'
): Promise<UriNode> {
  const fs = await import('fs/promises');

  const walk = async (rel = ''): Promise<UriNode> => {
    const dirPath = path.join(baseDir, rel);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const children: UriNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      // URIs are POSIX; windowsToPosix undoes path.join's backslashes on Windows.
      const relPath = windowsToPosix(path.join(rel, entry.name));
      if (entry.isDirectory()) {
        children.push(await walk(relPath));
      } else if (entry.isFile()) {
        if (CONTENT_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
          children.push({ uri: relPath });
        }
      }
    }
    return {
      uri: rel ?? '',
      children,
    };
  };

  // currently selection is unused but reserved for future features
  void selection;
  return walk('');
}

export class FileStorageProvider implements StorageProvider {
  readonly baseDir: string;
  readonly mountPoint: string;
  readonly ns?: ContentNamespace;

  /**
   * @param baseDir - Filesystem directory to serve files from (default: './content')
   * @param mountPoint - Logical mount point in the LOFS namespace (default: basename of baseDir).
   *   Must be unique across stacked providers — two providers with the same mount point
   *   produce indistinguishable provenance URIs. Pass explicitly when basename doesn't
   *   match the desired mount (e.g., OLX_CONTENT_DIR=/data/courses → mountPoint='content').
   * @param options.ns - Special-case namespace override: ALL files in this
   *   provider resolve to it, ignoring manifests and directory structure.
   *   The API wins over content declarations because reaching for this means
   *   you're doing something wonky — a test fixture, a scratch mount. Normal
   *   content sources omit it and let namespaceFor resolve per file
   *   (manifest override, then top-level directory).
   */
  constructor(baseDir = './content', mountPoint?: string, { ns }: { ns?: ContentNamespace } = {}) {
    this.baseDir = path.resolve(baseDir);
    const mp = mountPoint ?? path.basename(this.baseDir);
    if (!mp || mp.startsWith('/') || mp.includes('\0') || mp.split('/').some(s => s === '..')) {
      throw new Error(`Invalid mount point: "${mp}"`);
    }
    this.mountPoint = mp;
    this.ns = ns;
  }

  /**
   * Extract the path within this mount from a file: LofsRef.
   *
   * 'file:content://sba/foo.olx'         + mountPoint='content'         → 'sba/foo.olx'
   * 'file:content/ee/ee101://labs/l.olx'  + mountPoint='content/ee/ee101' → 'labs/l.olx'
   *
   * Throws on mount-point mismatch, which is how StackedStorageProvider
   * routes to the correct provider (try/catch fallthrough).
   */
  private extractRelativePath(uri: string): string {
    // In the LOFS address format the mount point is part of the source locator
    // (e.g., source("file:content://sba/foo.olx") → "file:content").
    // The path portion already contains only the relative path within the mount.
    const ref = brandLofsRef(uri);
    const expectedSource = `file:${this.mountPoint}`;
    if (source(ref) !== expectedSource) {
      throw new Error(
        `Mount point mismatch: URI '${uri}' doesn't match mount '${this.mountPoint}'`
      );
    }
    const rel = fileProvenancePath(uri);
    // path.normalize emits backslashes on Windows; refs stay POSIX.
    const normalized = windowsToPosix(path.normalize(rel));
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error(`Path traversal in provenance URI: ${uri}`);
    }
    return normalized;
  }

  async loadXmlFilesWithStats(previous: Record<LofsRef, XmlFileInfo> = {}): Promise<XmlScanResult> {
    const fs = await import('fs/promises');

    // Only diff against refs this provider owns. In a stacked scan, `previous`
    // contains other mounts' files — without this filter they would all be
    // reported as deleted (they're never "found" by walking this baseDir).
    const expectedSource = `file:${this.mountPoint}`;
    previous = Object.fromEntries(
      Object.entries(previous).filter(([key]) => source(brandLofsRef(key)) === expectedSource)
    ) as Record<LofsRef, XmlFileInfo>;

    function isContentFile(entry: any, fullPath: string) {
      const fileName = entry.name || fullPath.split('/').pop();
      return (
        entry.isFile() &&
        // manifest.yaml files are scanned as auxiliary files so the sync
        // can re-parse a manifest's subtree when its namespace changes.
        (CONTENT_EXTENSIONS.some(ext => fullPath.endsWith(ext)) || fileName === 'manifest.yaml') &&
        !fileName.includes('~') &&
        !fileName.includes('#') &&
        !fileName.startsWith('.')
      );
    }

    function fileChanged(statA: any, statB: any) {
      if (!statA || !statB) return true;
      return (
        statA.size !== statB.size ||
        statA.mtimeMs !== statB.mtimeMs ||
        statA.ctimeMs !== statB.ctimeMs
      );
    }

    const found: Record<LofsRef, boolean> = {};
    const added: Record<LofsRef, XmlFileInfo> = {};
    const changed: Record<LofsRef, XmlFileInfo> = {};
    const unchanged: Record<LofsRef, XmlFileInfo> = {};

    const walk = async (currentDir: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (isContentFile(entry, fullPath)) {
          // path.relative returns OS-native separators; refs must be POSIX.
          const ref = toFileRef(this.mountPoint, windowsToPosix(path.relative(this.baseDir, fullPath)));
          const stat = await fs.stat(fullPath);
          const ext = path.extname(fullPath).slice(1);
          const type = (fileTypes as any)[ext] ?? ext;
          const id = toLofsCanonical(withVersion(ref, toLofsVersion(String(stat.mtimeMs))));
          const key = withoutVersion(id);
          found[key] = true;
          const prev = previous[key];
          if (prev) {
            const prevMetadata = prev._metadata as unknown as FileMetadata;
            if (fileChanged(prevMetadata.stat, stat)) {
              const content = await fs.readFile(fullPath, 'utf-8');
              changed[key] = { id, type, _metadata: { stat } as unknown as JSONValue, content };
            } else {
              unchanged[key] = prev;
            }
          } else {
            const content = await fs.readFile(fullPath, 'utf-8');
            added[key] = { id, type, _metadata: { stat } as unknown as JSONValue, content };
          }
        }
      }
    };

    await walk(this.baseDir);

    const deleted: Record<LofsRef, XmlFileInfo> = Object.keys(previous)
      .filter(key => !(key in found))
      .reduce((out: Record<LofsRef, XmlFileInfo>, key: LofsRef) => {
        out[key] = previous[key];
        return out;
      }, {});

    return { added, changed, unchanged, deleted };
  }

  async read(filePath: OlxRelativePath): Promise<ReadResult> {
    const fs = await import('fs/promises');
    const full = await resolveSafeReadPath(this.baseDir, filePath);
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(full, 'utf-8'),
        fs.stat(full),
      ]);
      // path.relative returns OS-native separators; refs must be POSIX.
      const ref = toFileRef(this.mountPoint, windowsToPosix(path.relative(this.baseDir, full)));
      // Resolve the file's namespace so clients (e.g. studio) can render the
      // content where it actually lives. A file outside any namespace (root
      // configs, etc.) is still readable — it just has no content identity,
      // so ns stays undefined. Anything else (I/O failure, bug) propagates.
      let ns: ContentNamespace | undefined;
      try {
        ns = (await this.namespaceFor(ref)).ns;
      } catch (err) {
        if (!(err instanceof NamespaceResolutionError)) throw err;
      }
      return {
        content,
        metadata: { mtime: stat.mtimeMs, size: stat.size },
        provenance: toLofsCanonical(withVersion(ref, toLofsVersion(String(stat.mtimeMs)))),
        ns,
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath} (resolved to ${full})`);
      }
      throw err;
    }
  }

  async write(filePath: OlxRelativePath, content: string, options: WriteOptions = {}): Promise<void> {
    const { previousMetadata, force = false } = options;
    const fs = await import('fs/promises');
    const full = await resolveSafeWritePath(this.baseDir, filePath);

    // Check for version conflict if previousMetadata is provided
    if (previousMetadata && !force) {
      try {
        const stat = await fs.stat(full);
        const previous = previousMetadata as { mtime?: number; size?: number };
        if (previous.mtime !== undefined && stat.mtimeMs !== previous.mtime) {
          throw new VersionConflictError(
            'File has been modified since last read',
            { mtime: stat.mtimeMs, size: stat.size }
          );
        }
      } catch (err: any) {
        // If file doesn't exist but we have previous metadata, that's also a conflict
        if (err.code === 'ENOENT' && previousMetadata) {
          throw new VersionConflictError('File was deleted');
        }
        if (err.name === 'VersionConflictError') throw err;
        // Other errors (like permission) should propagate
        throw err;
      }
    }

    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
  }

  async update(path: OlxRelativePath, content: string): Promise<void> {
    await this.write(path, content);
  }

  async delete(filePath: OlxRelativePath): Promise<void> {
    const fs = await import('fs/promises');
    const full = await resolveSafeWritePath(this.baseDir, filePath);
    await fs.unlink(full);
  }

  toRelativePath(uri: LofsRef): OlxRelativePath {
    return this.extractRelativePath(uri) as OlxRelativePath;
  }

  async rename(oldPath: OlxRelativePath, newPath: OlxRelativePath): Promise<void> {
    const fs = await import('fs/promises');
    // Validate both paths with write safety checks
    const fullOld = await resolveSafeWritePath(this.baseDir, oldPath);
    const fullNew = await resolveSafeWritePath(this.baseDir, newPath);

    // Create destination directory if needed
    await fs.mkdir(path.dirname(fullNew), { recursive: true });

    // Rename/move the file
    await fs.rename(fullOld, fullNew);
  }

  async listFiles(selection: FileSelection = {}): Promise<UriNode> {
    return listFileTree(selection, this.baseDir);
  }

  resolveRelativePath(baseProvenance: LofsRef, relativePath: string): SafeRelativePath {
    // Runtime scheme check — defense-in-depth beyond TypeScript brands.
    if (scheme(brandLofsRef(baseProvenance)) !== 'file') {
      throw new Error(`Unsupported provenance format: ${baseProvenance}`);
    }

    // extractRelativePath validates the mount point and returns
    // the path within this mount (e.g., 'sba/file.xml').
    // Mount mismatch throws, which is how StackedStorageProvider
    // routes to the correct provider.
    const baseRelPath = this.extractRelativePath(baseProvenance);
    const baseDir = path.dirname(baseRelPath);
    // Refs are POSIX; path.normalize/join emit backslashes on Windows.
    const resolved = windowsToPosix(path.normalize(path.join(baseDir, relativePath)));

    // Security: validate resolved result stays within base directory.
    // Without this, a relativePath like "../../../../etc/passwd" could escape.
    if (resolved.startsWith('..') || path.isAbsolute(resolved)) {
      throw new Error(`Resolved path escapes base directory: ${relativePath}`);
    }

    return resolved as SafeRelativePath;
  }

  toLofsRef(safePath: SafeRelativePath): LofsRef {
    return toFileRef(this.mountPoint, safePath);
  }

  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
    try {
      if (!isMediaFile(assetPath)) {
        return false;
      }

      const fullPath = await resolveSafeReadPath(this.baseDir, assetPath);
      const fs = await import('fs/promises');
      const stat = await fs.stat(fullPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Resolve the content namespace for a file in this provider.
   *
   * Resolution order:
   *   1. Nearest ancestor manifest.yaml with a `namespace:` field, walking
   *      from the file's directory up to the provider root. The result
   *      carries the manifest as versioned provenance (NamespaceResolution.manifest).
   *   2. The file's top-level directory name ("demos/foo.olx" → "demos").
   *
   * Throws NamespaceResolutionError when neither yields a valid namespace:
   * a file at the provider root with no manifest, or a directory name the
   * namespace grammar rejects (e.g. "lo-blocks" — hyphens are not allowed).
   *
   * Change tracking: manifest.yaml files are included in loadXmlFilesWithStats
   * scans as auxiliary files, and the content sync re-parses the mount's
   * OLX when a manifest is added, changed, or deleted (see
   * promoteFilesAffectedByManifests in syncContentFromStorage.ts). No
   * caching here — every call re-reads manifests, so results are always
   * current within a sync.
   */
  async namespaceFor(ref: LofsRef): Promise<NamespaceResolution> {
    const relPath = this.extractRelativePath(withoutVersion(brandLofsRef(String(ref))));

    // Constructor override: the whole provider is one namespace, manifests
    // ignored (see constructor docs). relPath is still extracted above so
    // mount mismatches throw — that's how StackedStorageProvider routes to
    // the owning provider.
    if (this.ns) return { ns: this.ns };

    const fs = await import('fs/promises');

    // 1. Manifest override: nearest manifest.yaml from the file's directory up.
    for (let dir = path.dirname(relPath); ; dir = path.dirname(dir)) {
      const atRoot = dir === '.' || dir === '';
      // manifestRel becomes a ref below, so keep it POSIX (path.join → backslashes on Windows).
      const manifestRel = atRoot ? 'manifest.yaml' : windowsToPosix(path.join(dir, 'manifest.yaml'));
      let raw: string | null = null;
      let mtimeMs: number | null = null;
      try {
        const full = await resolveSafeReadPath(this.baseDir, manifestRel);
        [raw, mtimeMs] = await Promise.all([
          fs.readFile(full, 'utf-8'),
          fs.stat(full).then(s => s.mtimeMs),
        ]);
      } catch {
        // No manifest at this level — keep walking up.
      }
      if (raw !== null) {
        const declared = YAML.parse(raw)?.namespace;
        if (declared !== undefined) {
          const valid = validateContentNamespace(String(declared));
          if (valid !== true) {
            throw new NamespaceResolutionError(`${manifestRel}: ${valid}`);
          }
          const manifestRef = toFileRef(this.mountPoint, manifestRel);
          return {
            ns: asContentNamespace(String(declared)),
            manifest: toLofsCanonical(withVersion(manifestRef, toLofsVersion(String(mtimeMs)))),
          };
        }
        // Manifest without a namespace field — an ancestor manifest may declare one.
      }
      if (atRoot) break;
    }

    // 2. Directory fallback: the first path segment is the namespace.
    const sep = relPath.indexOf('/');
    if (sep < 0) {
      throw new NamespaceResolutionError(
        `"${relPath}" sits at the top level of the content directory, so it has no namespace. ` +
        `Move it into a namespace directory (e.g. "demos/${relPath}") or add a manifest.yaml ` +
        `with a "namespace:" field.`
      );
    }
    const dirName = relPath.slice(0, sep);
    const valid = validateContentNamespace(dirName);
    if (valid !== true) {
      throw new NamespaceResolutionError(
        `Directory "${dirName}" cannot be used as a content namespace: ${valid}. ` +
        `Rename the directory or add a manifest.yaml with an explicit "namespace:" field.`
      );
    }
    return { ns: asContentNamespace(dirName) };
  }

  /**
   * Find files matching a glob pattern.
   * Uses the 'glob' package for pattern matching.
   */
  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    const searchDir = basePath
      ? path.join(this.baseDir, basePath)
      : this.baseDir;

    // Validate the search directory is within allowed paths
    await resolveSafeReadPath(this.baseDir, basePath || '.');

    const matches = await globLib(pattern, {
      cwd: searchDir,
      nodir: true,  // Only return files, not directories
      dot: false,   // Don't match dotfiles
    });

    // Return paths relative to baseDir (not searchDir), POSIX separators.
    return matches.map(m =>
      windowsToPosix(basePath ? path.join(basePath, m) : m) as OlxRelativePath
    );
  }

  /**
   * Search file contents for a pattern.
   * Returns matching lines with file path and line number.
   */
  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    const { basePath, include, limit = 1000 } = options;
    const fs = await import('fs/promises');

    // First, get the list of files to search
    const filePattern = include || '**/*';
    const files = await this.glob(filePattern, basePath);

    // Content + code extensions for search
    const searchableExts = [...CONTENT_EXTENSIONS, '.ts', '.tsx', '.js', '.jsx', '.json'];

    const regex = new RegExp(pattern);
    const matches: GrepMatch[] = [];

    for (const filePath of files) {
      // Skip non-searchable files
      const ext = path.extname(filePath).toLowerCase();
      if (!searchableExts.includes(ext)) continue;

      try {
        const fullPath = await resolveSafeReadPath(this.baseDir, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches.push({
              path: filePath,
              line: i + 1,  // 1-indexed
              content: lines[i].trim(),
            });

            if (matches.length >= limit) {
              return matches;
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return matches;
  }
}
