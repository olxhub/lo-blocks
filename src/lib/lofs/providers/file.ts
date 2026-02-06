// src/lib/lofs/providers/file.ts
//
// File storage provider - local filesystem access for Learning Observer.
//
// Primary storage implementation for development and local deployments.
// Reads content from a base directory (default: ./content) with security
// sandboxing to prevent path traversal attacks.
//
import path from 'path';
import { glob as globLib } from 'glob';
import pegExts from '../../../generated/pegExtensions.json' assert { type: 'json' };
import type { ProvenanceURI } from '../../types';
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
  VersionConflictError,
} from '../types';
import { fileTypes } from '../fileTypes';
import type { JSONValue } from '../../types';

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
 * NOTE: Grammar directories here should match GRAMMAR_DIRS in src/lib/grammarDirs.ts
 * for the docs API to discover all grammars.
 */
function getAllowedReadDirs(): string[] {
  const dirs = [
    path.join(PROJECT_ROOT, 'src/components/blocks'),
    path.join(PROJECT_ROOT, 'src/lib/template'),  // For template grammar
    path.join(PROJECT_ROOT, 'src/lib/stateLanguage'),  // For expression grammar
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
export async function resolveSafeReadPath(baseDir: string, relPath: string): Promise<string> {
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
      return full;
    }
    throw err;
  }

  // Verify canonical path is within allowed read directories
  if (!isPathAllowed(canonicalPath, getAllowedReadDirs())) {
    throw new Error('Invalid path: resolves outside allowed directories');
  }

  return full;
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
export async function resolveSafeWritePath(baseDir: string, relPath: string): Promise<string> {
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
      return full;
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

  return full;
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
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        children.push(await walk(relPath));
      } else if (entry.isFile()) {
        const allowed = ['.xml', '.olx', '.md', ...pegExts.map(e => `.${e}`)];
        if (allowed.some(ext => entry.name.endsWith(ext))) {
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
  baseDir: string;

  constructor(baseDir = './content') {
    this.baseDir = path.resolve(baseDir);
  }

  async loadXmlFilesWithStats(previous: Record<ProvenanceURI, XmlFileInfo> = {}): Promise<XmlScanResult> {
    const fs = await import('fs/promises');

    function isContentFile(entry: any, fullPath: string) {
      const fileName = entry.name || fullPath.split('/').pop();
      // TODO: Do this in fileTypes.ts
      const allowed = ['.xml', '.olx', '.md', ...pegExts.map(e => `.${e}`)];
      return (
        entry.isFile() &&
        allowed.some(ext => fullPath.endsWith(ext)) &&
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

    const found: Record<ProvenanceURI, boolean> = {};
    const added: Record<ProvenanceURI, XmlFileInfo> = {};
    const changed: Record<ProvenanceURI, XmlFileInfo> = {};
    const unchanged: Record<ProvenanceURI, XmlFileInfo> = {};

    const walk = async (currentDir: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (isContentFile(entry, fullPath)) {
          const id = `file://${fullPath}` as ProvenanceURI;
          const stat = await fs.stat(fullPath);
          const ext = path.extname(fullPath).slice(1);
          const type = (fileTypes as any)[ext] ?? ext;
          found[id] = true;
          const prev = previous[id];
          if (prev) {
            const prevMetadata = prev._metadata as unknown as FileMetadata;
            if (fileChanged(prevMetadata.stat, stat)) {
              const content = await fs.readFile(fullPath, 'utf-8');
              changed[id] = { id, type, _metadata: { stat } as unknown as JSONValue, content };
            } else {
              unchanged[id] = prev;
            }
          } else {
            const content = await fs.readFile(fullPath, 'utf-8');
            added[id] = { id, type, _metadata: { stat } as unknown as JSONValue, content };
          }
        }
      }
    };

    await walk(this.baseDir);

    const deleted: Record<ProvenanceURI, XmlFileInfo> = Object.keys(previous)
      .filter(id => !(id in found))
      .reduce((out: Record<ProvenanceURI, XmlFileInfo>, id: ProvenanceURI) => {
        out[id] = previous[id];
        return out;
      }, {});

    return { added, changed, unchanged, deleted };
  }

  async read(filePath: string): Promise<ReadResult> {
    const fs = await import('fs/promises');
    const full = await resolveSafeReadPath(this.baseDir, filePath);
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(full, 'utf-8'),
        fs.stat(full),
      ]);
      return {
        content,
        metadata: { mtime: stat.mtimeMs, size: stat.size },
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath} (resolved to ${full})`);
      }
      throw err;
    }
  }

  async write(filePath: string, content: string, options: WriteOptions = {}): Promise<void> {
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

    await fs.writeFile(full, content, 'utf-8');
  }

  async update(path: string, content: string): Promise<void> {
    await this.write(path, content);
  }

  async delete(filePath: string): Promise<void> {
    const fs = await import('fs/promises');
    const full = await resolveSafeWritePath(this.baseDir, filePath);
    await fs.unlink(full);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
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

  resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): string {
    // Extract the file path from provenance URI relative to this provider's baseDir
    // e.g., "file:///home/user/projects/lo-blocks/content/sba/file.xml" -> "sba/file.xml"
    if (!baseProvenance.startsWith('file://')) {
      throw new Error(`Unsupported provenance format: ${baseProvenance}`);
    }

    const filePath = baseProvenance.slice(7); // Remove "file://"
    const relativeFilePath = path.relative(this.baseDir, filePath);

    if (relativeFilePath.startsWith('..')) {
      throw new Error(`Provenance file outside base directory: ${baseProvenance}`);
    }

    const baseDir = path.dirname(relativeFilePath);
    const resolved = path.join(baseDir, relativePath);
    return path.normalize(resolved);
  }

  async validateAssetPath(assetPath: string): Promise<boolean> {
    try {
      const { isMediaFile } = await import('@/lib/util/fileTypes');
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
   * Find files matching a glob pattern.
   * Uses the 'glob' package for pattern matching.
   */
  async glob(pattern: string, basePath?: string): Promise<string[]> {
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

    // Return paths relative to baseDir (not searchDir)
    return matches.map(m => basePath ? path.join(basePath, m) : m);
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

    // Content file extensions we should search
    const searchableExts = ['.xml', '.olx', '.md', '.ts', '.tsx', '.js', '.jsx', '.json', ...pegExts.map(e => `.${e}`)];

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
