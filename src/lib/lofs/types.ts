// src/lib/lofs/types.ts
//
// Type definitions for the storage abstraction layer.
//
// Defines the StorageProvider interface and related types used across
// all storage implementations (file, network, memory, git, postgres).
//
import { ProvenanceURI, JSONValue } from '../types';
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
 * Options for grep operation
 */
export interface GrepOptions {
  /** Base path to search from (default: root) */
  basePath?: string;
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
  path: string;
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

  read(path: string): Promise<ReadResult>;
  write(path: string, content: string, options?: WriteOptions): Promise<void>;
  update(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  listFiles(selection?: FileSelection): Promise<UriNode>;

  /**
   * Find files matching a glob pattern
   * @param pattern - Glob pattern (e.g., "**​/*.olx", "sba/**​/*psychology*")
   * @param basePath - Base path to search from (default: root)
   * @returns Array of matching file paths
   */
  glob(pattern: string, basePath?: string): Promise<string[]>;

  /**
   * Search file contents for a pattern
   * @param pattern - Search pattern (regex supported)
   * @param options - Search options (basePath, include filter, limit)
   * @returns Array of matches with file, line number, and content
   */
  grep(pattern: string, options?: GrepOptions): Promise<GrepMatch[]>;

  /**
   * Resolve a relative path against a base provenance URI
   * @param baseProvenance - Provenance URI of current OLX file
   * @param relativePath - Relative path from OLX (e.g., "static/image.png")
   * @returns Resolved path relative to content root (e.g., "mycourse/static/image.png")
   */
  resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): string;

  /**
   * Check if a static asset file exists and is valid
   * @param assetPath - Path relative to content root
   * @returns Promise<boolean>
   */
  validateAssetPath(assetPath: string): Promise<boolean>;
}
