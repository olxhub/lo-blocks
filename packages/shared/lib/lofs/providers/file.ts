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
import type { LofsRef, OlxRelativePath, SafeRelativePath, FileSystemPath } from '../../types';
import { type ContentNamespace, validateContentNamespace, asContentNamespace } from '../../types/id-grammar';
import { CATEGORY, isMediaFile } from '@/lib/util/fileTypes';
import { windowsToPosix } from '@/lib/util/posixPath';
import {
  type StorageProvider,
  type ContentFile,
  type FileSelection,
  type UriNode,
  type ReadResult,
  type FileChange,
  type CommitOptions,
  type CommitResult,
  type GrepOptions,
  type GrepMatch,
  type NamespaceResolution,
  VersionConflictError,
  NamespaceResolutionError,
  fileProvenancePath,
} from '../../types/storage';
import {
  type LofsOrigin,
  source, scheme, withVersion, withoutVersion, makeAddress,
  toLofsRef as brandLofsRef, toLofsOrigin, toLofsContentPath, toLofsVersion, toLofsCanonical,
} from '../../types/address';
import { registeredContentDirs } from '../allowedDirs';
import { fileTypes } from '../fileTypes';

/** CATEGORY.content (fileTypes.ts) lists content file extensions — OLX and its
 *  parse dependencies (.olx, .md, .liquid, .cast, etc.). We need the same list
 *  with dots prepended for filename.endsWith() matching in filesystem walks. */
const CONTENT_EXTENSIONS = CATEGORY.content.map(e => `.${e}`);

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
 * Content directories are declared via content-sources.yaml (contentSources.ts),
 * which registers each configured checkout with the allow-list at load time
 * (registerAllowedContentDir, see allowedDirs.ts). Callers outside that path —
 * standalone scripts, tests — register their own content dir explicitly.
 *
 * Future work:
 * - Move getAllowedReadDirs / getAllowedWriteDirs fully to provider config
 * - User-specific providers (like ~/lo-blocks-content/) configured per-user
 * - Role-based write permissions for shared providers (institution content)
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
 *
 * Beyond the built-in grammar/content dirs, this includes every directory
 * registered via registerAllowedContentDir — the configured content checkouts
 * (contentSources.ts) plus any a script or test registers explicitly.
 *
 * NOTE: Grammar directories here should match GRAMMAR_DIRS in packages/shared/lib/grammarDirs.ts
 * for the docs API to discover all grammars.
 */
function getAllowedReadDirs(): string[] {
  return [
    path.join(PROJECT_ROOT, 'packages/shared/components/blocks'),
    path.join(PROJECT_ROOT, 'packages/shared/lib/template'),  // For template grammar
    path.join(PROJECT_ROOT, 'packages/shared/lib/stateLanguage'),  // For expression grammar
    path.join(PROJECT_ROOT, 'packages/shared/lib/util/calc'),  // For calc grammar
    path.join(PROJECT_ROOT, 'content'),
    // Content checkouts registered by config or callers (see allowedDirs.ts)
    ...registeredContentDirs(),
  ];
}

/**
 * Get allowed directories for write operations: ./content plus every directory
 * registered via registerAllowedContentDir (configured checkouts + callers).
 */
function getAllowedWriteDirs(): string[] {
  return [
    path.join(PROJECT_ROOT, 'content'),
    // Content checkouts registered by config or callers (see allowedDirs.ts)
    ...registeredContentDirs(),
  ];
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
      uri: rel,
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
  /** This mount's address origin (`file:<mountPoint>`), built once. */
  readonly origin: LofsOrigin;
  readonly ns?: ContentNamespace;
  readonly defaultNs?: string;

  /**
   * @param baseDir - Filesystem directory to serve files from (default: './content')
   * @param mountPoint - Logical mount point in the LOFS namespace (default: basename of baseDir).
   *   Must be unique across stacked providers — two providers with the same mount point
   *   produce indistinguishable provenance URIs. Pass explicitly when basename doesn't
   *   match the desired mount (e.g., a checkout at /data/courses → mountPoint='content').
   * @param options.ns - Special-case namespace override: ALL files in this
   *   provider resolve to it, ignoring manifests and directory structure.
   *   The API wins over content declarations because reaching for this means
   *   you're doing something wonky — a test fixture, a scratch mount. Normal
   *   content sources omit it and let namespaceFor resolve per file
   *   (manifest override, then top-level directory).
   * @param options.defaultNs - Fallback namespace when no manifest declares
   *   one, REPLACING the top-level-directory rule. This is what a mounted
   *   single-collection source (content-sources.yaml) passes — its mount name
   *   — so that files at the checkout root, and files in subdirectories,
   *   resolve to the collection's namespace instead of an inner directory
   *   name. Mirrors GitStorageProvider's repo-name fallback. Manifests still
   *   override. Differs from `ns`: manifests and (absent a manifest) this
   *   default both apply per file; `ns` short-circuits everything.
   */
  constructor(
    baseDir = './content',
    mountPoint?: string,
    { ns, defaultNs }: { ns?: ContentNamespace; defaultNs?: string } = {},
  ) {
    this.baseDir = path.resolve(baseDir);
    const mp = mountPoint ?? path.basename(this.baseDir);
    if (!mp || mp.startsWith('/') || mp.includes('\0') || mp.split('/').some(s => s === '..')) {
      throw new Error(`Invalid mount point: "${mp}"`);
    }
    this.mountPoint = mp;
    this.origin = toLofsOrigin(`file:${mp}`);
    this.ns = ns;
    this.defaultNs = defaultNs;
  }

  /** Build a file: LofsRef for a content path in this mount. */
  private toRef(relativePath: string): LofsRef {
    if (relativePath.includes('\\')) {
      throw new Error(`Paths must use forward slashes: "${relativePath}"`);
    }
    return makeAddress(this.origin, toLofsContentPath(relativePath));
  }

  /**
   * Extract the path within this mount from a file: LofsRef.
   *
   * 'file:content://sba/foo.olx'         + mountPoint='content'         → 'sba/foo.olx'
   * 'file:content/ee/ee101://labs/l.olx'  + mountPoint='content/ee/ee101' → 'labs/l.olx'
   *
   * Throws on mount-point mismatch, which is how the union routes to the
   * correct source (try/catch fallthrough; see lib/lofs/sourceSet.ts).
   */
  private extractRelativePath(uri: string): string {
    // In the LOFS address format the mount point is part of the source locator
    // (e.g., source("file:content://sba/foo.olx") → "file:content").
    // The path portion already contains only the relative path within the mount.
    const ref = brandLofsRef(uri);
    if (source(ref) !== this.origin) {
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

  async listContent(): Promise<ContentFile[]> {
    const fs = await import('fs/promises');

    function isContentFile(entry: any, fullPath: string) {
      const fileName = entry.name || fullPath.split('/').pop();
      return (
        entry.isFile() &&
        // manifest.yaml files are enumerated as auxiliary content so the sync
        // sees a manifest edit as a changed namespace (parse-cache key) and
        // re-parses its subtree.
        (CONTENT_EXTENSIONS.some(ext => fullPath.endsWith(ext)) || fileName === 'manifest.yaml') &&
        !fileName.includes('~') &&
        !fileName.includes('#') &&
        !fileName.startsWith('.')
      );
    }

    const out: ContentFile[] = [];

    const walk = async (currentDir: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (isContentFile(entry, fullPath)) {
          // path.relative returns OS-native separators; refs must be POSIX.
          const ref = this.toRef(windowsToPosix(path.relative(this.baseDir, fullPath)));
          const stat = await fs.stat(fullPath);
          const ext = path.extname(fullPath).slice(1);
          const type = (fileTypes as any)[ext] ?? ext;
          // Version is the mtime — the SAME identity read() stamps on
          // provenance, so a parseDep recorded from a read compares equal here
          // when unchanged (see ContentFile).
          const id = toLofsCanonical(withVersion(ref, toLofsVersion(String(stat.mtimeMs))));
          const content = await fs.readFile(fullPath, 'utf-8');
          out.push({ id, type, content });
        }
      }
    };

    await walk(this.baseDir);
    return out;
  }

  /**
   * Cheap change token: a stat-only walk of the content tree. No file contents
   * are read (unlike listContent), so this stays fast enough to call
   * on every sync/request. The token combines the content-file count, the
   * newest mtime, and the total size — any add/remove/edit moves at least one
   * of them. A bare `touch` moves the mtime and forces a (harmless) rescan;
   * that's the accepted coarseness (see generationToken on StorageProvider).
   *
   * v1: no fs watchers (a later refinement). If the baseDir doesn't exist yet,
   * the walk yields the empty token — treated as "no content", consistent with
   * a scan of an absent tree.
   */
  async generationToken(): Promise<string> {
    const fs = await import('fs/promises');
    let count = 0;
    let maxMtimeMs = 0;
    let totalSize = 0;

    const walk = async (dir: string): Promise<void> => {
      let entries: any[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // missing/unreadable dir — contributes nothing
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!entry.isFile()) continue;
        const isContent =
          (CONTENT_EXTENSIONS.some(ext => entry.name.endsWith(ext)) || entry.name === 'manifest.yaml') &&
          !entry.name.includes('~') &&
          !entry.name.includes('#');
        if (!isContent) continue;
        const stat = await fs.stat(full);
        count++;
        totalSize += stat.size;
        if (stat.mtimeMs > maxMtimeMs) maxMtimeMs = stat.mtimeMs;
      }
    };

    await walk(this.baseDir);
    return `${count}:${maxMtimeMs}:${totalSize}`;
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
      const ref = this.toRef(windowsToPosix(path.relative(this.baseDir, full)));
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

  /**
   * Apply a change list to the filesystem. No cross-file atomicity (the git
   * provider gives that); changes apply in order via the existing safe-write
   * primitives. The per-file optimistic check (CommitOptions.base) preserves
   * the former save() mtime conflict semantics, and new mtimes come back in
   * CommitResult.versions.
   */
  async commit(changes: FileChange[], options: CommitOptions = {}): Promise<CommitResult> {
    const { force = false, base = [] } = options;
    const fs = await import('fs/promises');
    const baseByPath = new Map(base.map(b => [String(b.path), b.version]));
    const versions: Record<string, unknown> = {};

    for (const c of changes) {
      if (c.delete) {
        const full = await resolveSafeWritePath(this.baseDir, c.path);
        await fs.unlink(full);
      } else if (c.renameTo !== undefined) {
        const fullOld = await resolveSafeWritePath(this.baseDir, c.path);
        const fullNew = await resolveSafeWritePath(this.baseDir, c.renameTo);
        await fs.mkdir(path.dirname(fullNew), { recursive: true });
        await fs.rename(fullOld, fullNew);
      } else if (c.content !== undefined) {
        const full = await resolveSafeWritePath(this.baseDir, c.path);
        if (!force && baseByPath.has(String(c.path))) {
          await this.checkMtime(full, baseByPath.get(String(c.path)));
        }
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, c.content, 'utf-8');
        const stat = await fs.stat(full);
        versions[String(c.path)] = { mtime: stat.mtimeMs, size: stat.size };
      } else {
        throw new Error(`Empty change for "${c.path}": set content, delete, or renameTo`);
      }
    }
    return { versions };
  }

  /** Optimistic conflict: the mtime a caller last read (version) must still be
   *  current, or the file must still be present. Throws VersionConflictError. */
  private async checkMtime(full: string, version: unknown): Promise<void> {
    const fs = await import('fs/promises');
    const previous = (version ?? {}) as { mtime?: number; size?: number };
    try {
      const stat = await fs.stat(full);
      if (previous.mtime !== undefined && stat.mtimeMs !== previous.mtime) {
        throw new VersionConflictError(
          'File has been modified since last read',
          { mtime: stat.mtimeMs, size: stat.size },
        );
      }
    } catch (err: any) {
      // Read a version but the file is gone now — also a conflict.
      if (err.code === 'ENOENT') throw new VersionConflictError('File was deleted');
      throw err;
    }
  }

  toRelativePath(uri: LofsRef): OlxRelativePath {
    return this.extractRelativePath(uri) as OlxRelativePath;
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
    // Mount mismatch throws, which is how the union routes to the
    // correct source.
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
    return this.toRef(safePath);
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
   * Change tracking: manifest.yaml files are enumerated by listContent, and a
   * manifest edit that changes the resolved namespace re-parses its subtree
   * because the namespace is part of the parse-cache key (see
   * syncContentFromStorage / parseCache). No caching here — every call
   * re-reads manifests, so results are always current within a sync.
   */
  async namespaceFor(ref: LofsRef): Promise<NamespaceResolution> {
    const relPath = this.extractRelativePath(withoutVersion(brandLofsRef(String(ref))));

    // Constructor override: the whole provider is one namespace, manifests
    // ignored (see constructor docs). relPath is still extracted above so
    // mount mismatches throw — that's how the union routes to the owning
    // source (namespaceForAcross in lib/lofs/sourceSet.ts).
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
          const manifestRef = this.toRef(manifestRel);
          return {
            ns: asContentNamespace(String(declared)),
            manifest: toLofsCanonical(withVersion(manifestRef, toLofsVersion(String(mtimeMs)))),
          };
        }
        // Manifest without a namespace field — an ancestor manifest may declare one.
      }
      if (atRoot) break;
    }

    // 2. Mount default (set by mounted single-collection sources): the mount
    // name is the namespace, mirroring GitStorageProvider's repo-name
    // fallback. Set only for named mounts (contentSources.ts); the shared
    // ./content fallback leaves it unset and uses the directory rule below.
    // This is what preserves namespaces when a "<dir>/..." collection moves
    // out of ./content into its own checkout mounted at "<dir>".
    if (this.defaultNs !== undefined) {
      const valid = validateContentNamespace(this.defaultNs);
      if (valid !== true) {
        throw new NamespaceResolutionError(
          `Mount default namespace "${this.defaultNs}" is invalid: ${valid}. ` +
          `Rename the mount or add a manifest.yaml with an explicit "namespace:" field.`
        );
      }
      return { ns: asContentNamespace(this.defaultNs) };
    }

    // 3. Directory fallback: the first path segment is the namespace.
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
