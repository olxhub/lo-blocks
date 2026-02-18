// src/lib/lofs/types.ts
//
// Type definitions for the storage abstraction layer.
//
// Defines the StorageProvider interface and related types used across
// all storage implementations (file, network, memory, git, postgres).
//
import type {
  ProvenanceURI, FileProvenanceURI, MemoryProvenanceURI,
  JSONValue, OlxRelativePath, SafeRelativePath,
} from '../types';
import { FileType } from './fileTypes';

/**
 * Provider-specific metadata for change detection.
 *
 * Opaque to consumers. Each provider extends this with what it actually tracks.
 * Must be JSON-serializable - all properties should be primitives, arrays, or plain objects.
 *
 * Examples:
 * - FileStorageProvider: { stat: fs.Stats } (all properties are numbers/strings)
 * - MemoryStorageProvider: {} (empty for in-memory)
 * - GitStorageProvider: { hash: string } (commit hash)
 * - PostgresStorageProvider: { version: number, updated_at: string } (DB metadata)
 *
 * Future: May be branded or converted to a union type for better type safety.
 */
export type ProviderMetadata = JSONValue;

export interface XmlFileInfo {
  id: ProvenanceURI;
  type: FileType;
  /** Provider-specific metadata for change detection (opaque to consumers). */
  _metadata: ProviderMetadata;
  content: string;
}

export interface XmlScanResult {
  added: Record<ProvenanceURI, XmlFileInfo>;
  changed: Record<ProvenanceURI, XmlFileInfo>;
  unchanged: Record<ProvenanceURI, XmlFileInfo>;
  deleted: Record<ProvenanceURI, XmlFileInfo>;
}

export interface FileSelection {
  // Reserved for future filtering options
  [key: string]: any;
}

export interface UriNode {
  uri: string;
  children?: UriNode[];
}

/**
 * Result from reading a file, includes opaque metadata for conflict detection
 */
export interface ReadResult {
  content: string;
  /** Provider-specific metadata (mtime, git hash, etag, etc.) - opaque to consumers */
  metadata?: unknown;
  /**
   * Provenance URI identifying which specific storage instance served this read.
   * The same SafeRelativePath may exist in multiple providers (postgres, git,
   * memory); this tells you which one the content actually came from.
   *
   * Optional for backwards compatibility — new provider implementations
   * should always set this.
   */
  provenance?: ProvenanceURI;
}

/**
 * Options for writing a file with optional conflict detection
 */
export interface WriteOptions {
  /** Metadata from previous read - if provided and doesn't match current, write fails */
  previousMetadata?: unknown;
  /** Force write even if metadata mismatch */
  force?: boolean;
}

/**
 * Error thrown when write conflicts with changed file
 */
export class VersionConflictError extends Error {
  /** Current metadata of the file (for potential retry/merge) */
  currentMetadata?: unknown;

  constructor(message = 'File has been modified', currentMetadata?: unknown) {
    super(message);
    this.name = 'VersionConflictError';
    this.currentMetadata = currentMetadata;
  }
}

/**
 * Validate and brand a string as OlxRelativePath.
 * Use at system boundaries where user input enters the storage type system.
 *
 * Minimal validation (parallel to toOlxReference for IDs):
 * - Non-empty string
 * - No null bytes (security)
 * - Not absolute (doesn't start with /)
 *
 * Does NOT reject ".." — parent traversal is valid in OLX relative paths
 * (e.g., src="../x.png" in /foo/bar/baz.olx refers to /foo/x.png).
 * Resolution of ".." against a referring file's location is handled by
 * resolveRelativePath, not here.
 *
 * Security enforcement (traversal, symlinks, allowed dirs) stays at the
 * filesystem provider level (resolveSafeReadPath / resolveSafeWritePath).
 *
 * Client-safe: no Node.js path module dependency.
 */
export function toOlxRelativePath(
  input: string,
  // context?: { namespace?: string; referrer?: string }
  //
  // Future: resolution context for scoped paths. If content is namespaced
  // (e.g., Prof. Smith's electronics course at UofC), the context would
  // carry the namespace so that "problemset1.olx" resolves to
  // "uofc/electronics/smith/problemset1.olx". For now, callers handle
  // scoping externally and pass already-scoped paths.
): OlxRelativePath {
  if (!input || typeof input !== 'string') {
    throw new Error(`toOlxRelativePath: expected non-empty string but got "${input}"`);
  }
  if (input.includes('\0')) {
    throw new Error(`toOlxRelativePath: path contains null bytes: "${input}"`);
  }
  if (input.startsWith('/')) {
    throw new Error(`toOlxRelativePath: expected relative path but got absolute "${input}"`);
  }
  return input as OlxRelativePath;
}

/**
 * Construct a file:// provenance URI from a mount point and relative path.
 *
 * @param mountPoint - Logical mount name (e.g., 'content', 'content/ee/ee101')
 * @param relativePath - Path within the mount (e.g., 'sba/foo.olx')
 * @returns e.g. 'file:///content/sba/foo.olx'
 */
export function toFileProvenanceURI(mountPoint: string, relativePath: string): FileProvenanceURI {
  if (relativePath.includes('\\')) {
    throw new Error(`Provenance paths must use forward slashes: "${relativePath}"`);
  }
  return `file:///${mountPoint}/${relativePath}` as FileProvenanceURI;
}

/**
 * Extract the logical path from any provenance URI using standard URL parsing.
 *
 * Combines hostname and pathname so the result is correct regardless of
 * whether the namespace sits in the authority (scheme://ns/path) or the
 * path (scheme:///ns/path).
 *
 * Examples:
 *   'file:///content/sba/foo.olx'    → 'content/sba/foo.olx'
 *   'network:///content/sba/foo.olx' → 'content/sba/foo.olx'
 *   'memory:///test.xml'             → 'test.xml'
 */
export function provenancePath(uri: string): string {
  const parsed = new URL(uri);
  return decodeURIComponent((parsed.hostname + parsed.pathname).replace(/^\/+/, ''));
}

/**
 * Extract the logical path from a file:// provenance URI.
 *
 * Returns the full path after file:/// — e.g. 'content/sba/foo.olx'
 * from 'file:///content/sba/foo.olx'.
 *
 * Mount point resolution is the provider's responsibility — see
 * FileStorageProvider.extractRelativePath().
 */
export function fileProvenancePath(uri: string): string {
  if (!uri.startsWith('file:///')) {
    throw new Error(`Not a file provenance URI: ${uri}`);
  }
  return provenancePath(uri);
}

/**
 * Brand a memory:// provenance URI. Used by InMemoryStorageProvider.
 */
export function toMemoryProvenanceURI(name: string): MemoryProvenanceURI {
  return `memory:///${name}` as MemoryProvenanceURI;
}

/**
 * Options for grep operation
 */
export interface GrepOptions {
  /** Base path to search from (default: root) */
  basePath?: OlxRelativePath;
  /** Glob pattern to filter files (e.g., "*.olx") */
  include?: string;
  /** Maximum number of results to return */
  limit?: number;
}

/**
 * A single grep match result
 */
export interface GrepMatch {
  /** Path to the file containing the match */
  path: OlxRelativePath;
  /** Line number (1-indexed) */
  line: number;
  /** Content of the matching line */
  content: string;
}

export interface StorageProvider {
  /**
   * Scan for XML/OLX files returning added/changed/unchanged/deleted
   * relative to a previous scan. The `_metadata` structure is
   * provider specific (mtime+size, git hash, DB id, etc.).
   */
  loadXmlFilesWithStats(previous?: Record<ProvenanceURI, XmlFileInfo>): Promise<XmlScanResult>;

  read(path: OlxRelativePath): Promise<ReadResult>;
  write(path: OlxRelativePath, content: string, options?: WriteOptions): Promise<void>;
  update(path: OlxRelativePath, content: string): Promise<void>;
  delete(path: OlxRelativePath): Promise<void>;
  rename(oldPath: OlxRelativePath, newPath: OlxRelativePath): Promise<void>;
  listFiles(selection?: FileSelection): Promise<UriNode>;

  /**
   * Find files matching a glob pattern
   * @param pattern - Glob pattern (e.g., "**​/*.olx", "sba/**​/*psychology*")
   * @param basePath - Base path to search from (default: root)
   * @returns Array of matching file paths (OlxRelativePath)
   */
  glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]>;

  /**
   * Search file contents for a pattern
   * @param pattern - Search pattern (regex supported)
   * @param options - Search options (basePath, include filter, limit)
   * @returns Array of matches with file, line number, and content
   */
  grep(pattern: string, options?: GrepOptions): Promise<GrepMatch[]>;

  /**
   * Resolve a relative path against a base provenance URI.
   * Validates the resolved result stays within the content directory.
   *
   * @param baseProvenance - Provenance URI of current OLX file
   * @param relativePath - Raw relative path from OLX (e.g., "static/image.png")
   * @returns SafeRelativePath — escape-validated, safe to use without further traversal checks
   */
  resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): SafeRelativePath;

  /**
   * Construct the provenance URI for a content path in this provider.
   *
   * Maps from a canonical name (SafeRelativePath) to this provider's
   * location URI. For example:
   * - FileStorageProvider:   "sba/foo.olx" → "file:///content/sba/foo.olx"
   * - InMemoryStorageProvider: "sba/foo.olx" → "memory:///sba/foo.olx"
   *
   * Used by parsers to extend provenance chains without knowing about
   * storage schemes. See also ReadResult.provenance (set during read).
   */
  toProvenanceURI(path: SafeRelativePath): ProvenanceURI;

  /**
   * Check if a static asset file exists and is valid
   * @param assetPath - Path relative to content root
   * @returns Promise<boolean>
   */
  validateAssetPath(assetPath: OlxRelativePath): Promise<boolean>;
}
