// packages/shared/lib/types/storage.ts
//
// Type definitions for the storage abstraction layer.
//
// Defines the StorageProvider interface and related types used across
// all storage implementations (file, network, memory, git, postgres).
//
import type {
  FileLofsRef, MemoryLofsRef,
  JSONValue, OlxRelativePath, SafeRelativePath,
} from './core';
import type { ContentNamespace } from './id-grammar';
import {
  type LofsRef, type LofsCanonical,
  makeAddress, addressPath, scheme, withVersion,
  toLofsRef, toLofsOrigin, toLofsContentPath, toLofsVersion, toLofsCanonical,
} from './address';
import { FileType } from '../lofs/fileTypes';

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
  id: LofsCanonical;
  type: FileType;
  /** Provider-specific metadata for change detection (opaque to consumers). */
  _metadata: ProviderMetadata;
  content: string;
}

export interface XmlScanResult {
  added: Record<LofsRef, XmlFileInfo>;
  changed: Record<LofsRef, XmlFileInfo>;
  unchanged: Record<LofsRef, XmlFileInfo>;
  deleted: Record<LofsRef, XmlFileInfo>;
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
   */
  provenance: LofsCanonical;
  /**
   * The file's content namespace, as resolved by the provider
   * (see namespaceFor). Lets clients (e.g. the studio editor) render
   * fetched content in its real namespace. Absent when the file resolves
   * to no namespace (e.g. a config file at the content root).
   */
  ns?: ContentNamespace;
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
 * Thrown by namespaceFor when a file resolves to NO content namespace.
 * I/O failures and bugs stay plain errors — this class marks exactly the
 * "the rules produced no answer" outcomes, so callers can distinguish them.
 *
 * WHO THROWS (the concrete cases):
 * - FileStorageProvider.namespaceFor:
 *   1. File at the content root with no manifest — e.g. content/static.config.json,
 *      or an author dropping foo.olx directly into content/.
 *   2. Top-level directory name the namespace grammar rejects (e.g. "my-course",
 *      hyphens are forbidden) with no manifest override.
 *   3. A manifest.yaml whose namespace: field is itself grammar-invalid.
 * - DocsStorageProvider.namespaceFor: a file matching no registered block
 *   name AND sitting at the docs root (no containing directory to fall
 *   back to).
 *
 * WHO CATCHES:
 * - FileStorageProvider.read: a namespace-less file is still readable
 *   (studio opens static.config.json) — it catches exactly this class,
 *   leaves ReadResult.ns undefined, and rethrows everything else.
 * - The content sync (parseAndIndexFiles) deliberately does NOT catch it:
 *   OLX without a namespace can't be indexed, so it surfaces as a per-file
 *   error whose message tells the author what to do (move the file or add
 *   a manifest).
 */
export class NamespaceResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NamespaceResolutionError';
  }
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
 * Allowed characters in a single path segment (filename or directory name):
 * Unicode letters/digits, dot, hyphen, underscore. Everything else is rejected.
 * Conservative allowlist — avoids shell metacharacters, URI-unsafe chars, and
 * OS-reserved chars while remaining i18n-friendly.
 */
const ALLOWED_SEGMENT_CHARS = /^[\p{L}\p{N}._-]+$/u;

/** Matches any character NOT in the allowlist. Global, for stripping from user input.
 *  Also permits `/` so it works on full paths (segment validation catches per-segment issues). */
export const FORBIDDEN_FILENAME_CHARS = /[^\p{L}\p{N}._\/-]/gu;

/**
 * Validate a single path segment (filename or directory name).
 * Returns null if valid, or an error message string if invalid.
 * Client-safe: no Node.js dependency.
 */
export function validatePathSegment(segment: string): string | null {
  if (!segment) return 'Empty path segment';
  if (segment.startsWith('.')) return 'Hidden files (starting with .) not allowed';
  if (!ALLOWED_SEGMENT_CHARS.test(segment)) {
    const badChar = segment.match(/[^\p{L}\p{N}._-]/u);
    return `Character "${badChar?.[0]}" is not allowed in filenames`;
  }
  return null;
}

/**
 * Validate and brand a string as OlxRelativePath.
 * Use at system boundaries where user input enters the storage type system.
 *
 * Rejects:
 * - Empty / non-string input
 * - Absolute paths (starting with /)
 * - URI-unsafe characters (#, ?) and OS-reserved characters in segments
 * - Control characters (including null bytes)
 * - Leading/trailing whitespace or leading dots in segments
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
  if (input.startsWith('/')) {
    throw new Error(`toOlxRelativePath: expected relative path but got absolute "${input}"`);
  }
  for (const segment of input.split('/')) {
    if (segment === '..' || segment === '.') continue;
    const error = validatePathSegment(segment);
    if (error) {
      throw new Error(`toOlxRelativePath: invalid segment "${segment}": ${error}`);
    }
  }
  return input as OlxRelativePath;
}

/**
 * Construct a file: LofsRef from a mount point and relative path.
 *
 * Uses LOFS address format: file:mountPoint://relativePath
 *
 * @param mountPoint - Logical mount name (e.g., 'content', 'content/ee/ee101')
 * @param relativePath - Path within the mount (e.g., 'sba/foo.olx')
 * @returns e.g. 'file:content://sba/foo.olx'
 */
export function toFileRef(mountPoint: string, relativePath: string): FileLofsRef {
  if (relativePath.includes('\\')) {
    throw new Error(`Paths must use forward slashes: "${relativePath}"`);
  }
  return makeAddress(
    toLofsOrigin(`file:${mountPoint}`),
    toLofsContentPath(relativePath),
  ) as unknown as FileLofsRef;
}

/**
 * Extract the content path from any LofsRef.
 *
 * Uses the LOFS address parser (last "://" rule).
 *
 * Examples:
 *   'file:content://sba/foo.olx'     → 'sba/foo.olx'
 *   'network:content://sba/foo.olx'  → 'sba/foo.olx'
 *   'memory:local://test.xml'        → 'test.xml'
 */
export function provenancePath(uri: string): string {
  return addressPath(toLofsRef(uri));
}

/**
 * Extract the content path from a file: LofsRef.
 *
 * Returns the path part — e.g. 'sba/foo.olx'
 * from 'file:content://sba/foo.olx'.
 *
 * Mount point resolution is the provider's responsibility — see
 * FileStorageProvider.extractRelativePath().
 */
export function fileProvenancePath(uri: string): string {
  const ref = toLofsRef(uri);
  if (scheme(ref) !== 'file') {
    throw new Error(`Not a file ref: ${uri}`);
  }
  return addressPath(ref);
}

/**
 * Construct a memory: LofsRef. Used by InMemoryStorageProvider.
 *
 * @param name - File path within the memory store
 * @param sourceId - Source identifier (default: 'local')
 */
export function toMemoryRef(name: string, sourceId = 'local'): MemoryLofsRef {
  return makeAddress(
    toLofsOrigin(`memory:${sourceId}`),
    toLofsContentPath(name),
  ) as unknown as MemoryLofsRef;
}

/**
 * Construct a git: LofsRef.
 * Format: git:mountPoint://path
 */
export function toGitRef(mountPoint: string, filePath: string): LofsRef {
  return makeAddress(
    toLofsOrigin(`git:${mountPoint}`),
    toLofsContentPath(filePath),
  );
}

/**
 * Construct a postgres: LofsRef.
 * Format: postgres:tenant://path
 */
export function toPgRef(tenant: string, filePath: string): LofsRef {
  return makeAddress(
    toLofsOrigin(`postgres:${tenant}`),
    toLofsContentPath(filePath),
  );
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
  loadXmlFilesWithStats(previous?: Record<LofsRef, XmlFileInfo>): Promise<XmlScanResult>;

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
   * Resolve a relative path against a base LofsRef.
   * Validates the resolved result stays within the content directory.
   *
   * @param baseRef - LofsRef of current OLX file
   * @param relativePath - Raw relative path from OLX (e.g., "static/image.png")
   * @returns SafeRelativePath — escape-validated, safe to use without further traversal checks
   */
  resolveRelativePath(baseProvenance: LofsRef, relativePath: string): SafeRelativePath;

  /**
   * Construct the LofsRef for a content path in this provider.
   *
   * Maps from a SafeRelativePath to this provider's address. For example:
   * - FileStorageProvider:     "sba/foo.olx" → "file:content://sba/foo.olx"
   * - InMemoryStorageProvider: "sba/foo.olx" → "memory:local://sba/foo.olx"
   *
   * Used by parsers to extend provenance without knowing about
   * storage schemes. See also ReadResult.provenance (set during read).
   */
  toLofsRef(path: SafeRelativePath): LofsRef;

  /**
   * Extract the relative path from a LofsRef in this provider.
   *
   * Inverse of toLofsRef. For example:
   * - FileStorageProvider:     "file:content://sba/foo.olx" → "sba/foo.olx"
   * - InMemoryStorageProvider: "memory:local://sba/foo.olx" → "sba/foo.olx"
   *
   * Used by translation orchestration to navigate between source and
   * translated file paths without knowing the provider's address scheme.
   */
  toRelativePath(uri: LofsRef): OlxRelativePath;

  /**
   * Check if a static asset file exists and is valid
   * @param assetPath - Path relative to content root
   * @returns Promise<boolean>
   */
  validateAssetPath(assetPath: OlxRelativePath): Promise<boolean>;

  /**
   * Resolve the content namespace for a file in this provider.
   *
   * The namespace identifies WHAT content collection a file belongs to
   * (logical identity), independent of WHERE it lives (this provider).
   * See ContentNamespace in id-grammar.ts.
   *
   * Resolution is provider-specific. A manifest.yaml `namespace:` field
   * overrides where the provider supports manifests; otherwise each
   * provider has its own fallback:
   * - FileStorageProvider:     nearest ancestor manifest.yaml, else the
   *                            file's top-level directory ("demos/foo.olx" → "demos")
   * - GitStorageProvider:      repo manifest, else defaultNamespace(origin) (repo name)
   * - InMemoryStorageProvider: constructor option
   * - StackedStorageProvider:  delegates to the provider that owns the ref
   *
   * Throws NamespaceResolutionError (with an author-friendly message) when
   * no namespace can be determined — e.g., a file at the root of a
   * multi-namespace content directory with no manifest.
   */
  namespaceFor(ref: LofsRef): Promise<NamespaceResolution>;
}

/**
 * Result of namespaceFor — the namespace plus where it came from.
 *
 * `manifest` is the manifest.yaml that DECLARED the namespace, as read
 * (versioned, so it's comparable for staleness). Absent when the namespace
 * came from a non-manifest rule: directory name, constructor override,
 * provider constant. The content sync stamps it onto each parsed block
 * (OlxJson.manifest) — namespace provenance, alongside source/parseDeps.
 */
export interface NamespaceResolution {
  ns: ContentNamespace;
  manifest?: LofsCanonical;
}
