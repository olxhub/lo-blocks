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
import { fileProvenancePath } from '../types/storage';
import { source, toLofsRef } from '../types/address';
import type { SafeRelativePath } from '@/lib/types';

// Base directory for content - resolved once at module load
const CONTENT_BASE = path.resolve('./content');

// Valid file extensions for content files (derived from central fileTypes)
const ALLOWED_EXTENSIONS = extensionsWithDots(CATEGORY.content); // ['.olx', '.xml', '.md', '.chatpeg', ...]

export interface PathValidation {
  valid: boolean;
  /** Escape-validated relative path within content directory (when valid: true). */
  relativePath?: SafeRelativePath;
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

  // Reject version delimiter (# is reserved in LOFS addresses)
  if (relPath.includes('#')) {
    return { valid: false, error: 'Path must not contain "#" (reserved as LOFS version delimiter)' };
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

  return { valid: true, relativePath: normalized as SafeRelativePath };
}

/**
 * Extract the content-relative path from a LofsRef.
 *
 * With mount-point URIs, the path after :// is relative to the mount:
 * 'file:content://demos/foo.xml' → content path 'demos/foo.xml'.
 * fileProvenancePath extracts the path part and prepends the mount for validation.
 *
 * @param provenance - Array of provenance URIs (LofsRef strings)
 * @returns Validation result with relative path or error message
 *
 * @example
 * getEditPathFromProvenance(['file:content://demos/foo.xml'])
 * // => { valid: true, relativePath: 'demos/foo.xml' }
 */
export function getEditPathFromProvenance(provenance: string[] | undefined): PathValidation {
  if (!provenance || !Array.isArray(provenance) || provenance.length === 0) {
    return { valid: false, error: 'No provenance available' };
  }

  const fileProv = provenance.find(p => p.startsWith('file:'));
  if (!fileProv) {
    return { valid: false, error: 'No file provenance found (content may be from non-file source)' };
  }

  let logicalPath: string;
  try {
    logicalPath = fileProvenancePath(fileProv);
  } catch {
    return { valid: false, error: 'Malformed file provenance URI' };
  }

  // Only accept files from the content mount
  // In the new format, the mount point is in the source locator: file:content://path
  const src = source(toLofsRef(fileProv)) as string;
  if (src !== 'file:content' && !src.startsWith('file:content/')) {
    return { valid: false, error: 'File is not in the content mount' };
  }

  // logicalPath is already relative to the mount (e.g. 'demos/foo.xml')
  const normalized = path.normalize(logicalPath);

  // Security: reject paths that escape via traversal
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    return { valid: false, error: 'File is outside content directory' };
  }

  return { valid: true, relativePath: normalized as SafeRelativePath };
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
