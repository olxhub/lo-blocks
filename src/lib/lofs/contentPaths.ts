// src/lib/lofs/contentPaths.ts
//
// Server-side utilities for content path validation and resolution.
//
// Validates LofsPath (storage layer paths like "content/demos/foo.olx")
// and converts them to FileSystemPath for safe filesystem access.
//
// NOTE: Server-only module (uses Node.js path). Do not import from client code.
//
import path from 'path';
import { extensionsWithDots, CATEGORY } from '@/lib/util/fileTypes';
import type { LofsPath, FileSystemPath, OlxRelativePath } from '@/lib/types';

// Base directory for content - resolved once at module load
const CONTENT_BASE = path.resolve('./content');

// Valid file extensions for content files (derived from central fileTypes)
const ALLOWED_EXTENSIONS = extensionsWithDots(CATEGORY.content); // ['.olx', '.xml', '.md', '.chatpeg', ...]

export interface PathValidation {
  valid: boolean;
  relativePath?: string;  // FileSystemPath relative to content base (when valid: true)
  error?: string;
}

/**
 * Validate a LofsPath and extract the FileSystemPath relative to content base.
 *
 * LofsPath must include the "content/" prefix to enforce LOFS path structure.
 * Extracts and validates the relative path within the content directory.
 *
 * Checks:
 * 1. Path starts with "content/" prefix (LOFS structure requirement)
 * 2. Relative path doesn't escape content directory (no ..)
 * 3. File has a valid extension
 *
 * @param lofsPath - Storage path including "content/" prefix (e.g., "content/demos/foo.olx")
 * @returns PathValidation with extracted FileSystemPath relative to content base, or error
 * @example
 * validateContentPath("content/demos/foo.olx")
 * // => { valid: true, relativePath: "demos/foo.olx" }
 */
export function validateContentPath(lofsPath: string): PathValidation {
  if (!lofsPath) {
    return { valid: false, error: 'Missing path' };
  }

  const CONTENT_PREFIX = 'content/';

  // Enforce content/ prefix
  if (!lofsPath.startsWith(CONTENT_PREFIX)) {
    return {
      valid: false,
      error: `Path must start with '${CONTENT_PREFIX}' prefix (received: '${lofsPath}')`
    };
  }

  // Extract relative path (remove "content/" prefix)
  const relPath = lofsPath.slice(CONTENT_PREFIX.length);

  if (!relPath) {
    return { valid: false, error: "Path cannot be empty after 'content/' prefix" };
  }

  // Normalize and check for directory traversal
  const normalized = path.normalize(relPath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    return { valid: false, error: 'Path escapes content directory' };
  }

  // Check file extension
  const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => normalized.endsWith(ext));
  if (!hasValidExtension) {
    return {
      valid: false,
      error: `Invalid file type. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`
    };
  }

  return { valid: true, relativePath: normalized };
}

/**
 * Extract the content-relative path from a provenance URI.
 *
 * @param provenance - Array of provenance URIs
 * @returns Validation result with relative path or error message
 *
 * @example
 * getEditPathFromProvenance(['file:///abs/path/content/demos/foo.xml'])
 * // => { valid: true, relativePath: 'demos/foo.xml' }
 */
export function getEditPathFromProvenance(provenance: string[] | undefined): PathValidation {
  if (!provenance || !Array.isArray(provenance) || provenance.length === 0) {
    return { valid: false, error: 'No provenance available' };
  }

  const fileProv = provenance.find(p => p.startsWith('file://'));
  if (!fileProv) {
    return { valid: false, error: 'No file provenance found (content may be from non-file source)' };
  }

  const absPath = fileProv.slice('file://'.length);
  const relativePath = path.relative(CONTENT_BASE, absPath);

  // Security: reject paths outside content directory
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return { valid: false, error: 'File is outside content directory' };
  }

  return { valid: true, relativePath };
}

/**
 * Get the list of allowed file extensions.
 */
export function getAllowedExtensions(): readonly string[] {
  return ALLOWED_EXTENSIONS;
}

/**
 * Get the resolved content base directory path.
 */
export function getContentBase(): string {
  return CONTENT_BASE;
}
