// src/lib/storage/contentPaths.ts
//
// Server-side utilities for content path validation and resolution.
//
// Centralizes path security checks used by API routes and storage providers.
// Ensures paths stay within the content directory and have valid extensions.
//
// NOTE: Server-only module (uses Node.js path). Do not import from client code.
//
import path from 'path';
import { extensionsWithDots, CATEGORY } from '@/lib/util/fileTypes';

// Base directory for content - resolved once at module load
const CONTENT_BASE = path.resolve('./content');

// Valid file extensions for content files (derived from central fileTypes)
const ALLOWED_EXTENSIONS = extensionsWithDots(CATEGORY.content); // ['.olx', '.xml', '.md', '.chatpeg', ...]

export interface PathValidation {
  valid: boolean;
  relativePath?: string;
  error?: string;
}

/**
 * Validate and normalize a relative content path.
 *
 * Checks:
 * 1. Path doesn't escape content directory (no ..)
 * 2. Path has a valid extension
 *
 * @param relPath - Relative path within content directory
 * @returns Validation result with normalized path or error message
 */
export function validateContentPath(relPath: string): PathValidation {
  if (!relPath) {
    return { valid: false, error: 'Missing path' };
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
