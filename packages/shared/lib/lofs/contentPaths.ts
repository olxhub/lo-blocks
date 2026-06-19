// packages/shared/lib/lofs/contentPaths.ts
//
// Server-side validation for repo-relative content paths arriving over HTTP.
//
// A path from a request is untrusted: it must not escape the source it targets
// or name a non-content file. This validates the path is a safe, repo-relative
// content path (e.g. "unit1/lesson.olx") before it reaches a provider. The
// origin/source is carried separately (the `source` request param), so paths no
// longer carry a "content/" prefix — that was the serialized name of the old
// default filesystem origin, redundant now that origin is explicit.
//
// NOTE: Server-only module (uses Node.js path). Do not import from client code.
//
import path from 'path';
import { extensionsWithDots, CATEGORY } from '@/lib/util/fileTypes';
import type { SafeRelativePath } from '@/lib/types';

// Valid file extensions for content files (derived from central fileTypes)
const ALLOWED_EXTENSIONS = extensionsWithDots(CATEGORY.content); // ['.olx', '.xml', '.md', '.chatpeg', ...]

export interface PathValidation {
  valid: boolean;
  /** Escape-validated repo-relative content path (when valid: true). */
  relativePath?: SafeRelativePath;
  error?: string;
}

/**
 * Validate an untrusted, repo-relative content path from a request.
 *
 * Checks:
 * 1. Non-empty
 * 2. No "#" (reserved as the LOFS version delimiter)
 * 3. Doesn't escape its source via traversal ("..") or an absolute path
 * 4. Has a recognized content extension
 *
 * The path is relative to whatever source the request targets — a git repo
 * root, or the local content directory. (This is the decode-at-the-boundary
 * point for the future `RepoRelativePath` brand.)
 *
 * @example
 * validateRepoRelativePath("unit1/lesson.olx")
 * // => { valid: true, relativePath: "unit1/lesson.olx" }
 */
export function validateRepoRelativePath(repoPath: string): PathValidation {
  if (!repoPath) {
    return { valid: false, error: 'Missing path' };
  }

  // Reject version delimiter (# is reserved in LOFS addresses)
  if (repoPath.includes('#')) {
    return { valid: false, error: 'Path must not contain "#" (reserved as LOFS version delimiter)' };
  }

  // Normalize and check for directory traversal
  const normalized = path.normalize(repoPath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    return { valid: false, error: 'Path escapes its content source' };
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
