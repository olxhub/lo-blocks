// src/lib/lofs/pathResolve.ts
//
// Shared path resolution for LOFS providers.
//
// Extracts the directory from a provenance URI and resolves a relative path
// against it. Used by memory, network, postgres, and git providers.
//
import { path as addressPath, toLofsAddress } from '../types/address';

/**
 * Resolve a relative path against a base provenance URI.
 *
 * Extracts the content path from the provenance, gets its directory,
 * joins with relativePath, and normalizes `.` / `..` segments.
 *
 * @param baseProvenance - Provenance URI (e.g., "memory:local://subdir/lesson.olx")
 * @param relativePath - Relative path to resolve (e.g., "../notes.md")
 * @returns Resolved path relative to the storage root
 * @throws Error if the path escapes the root directory
 */
export function resolveRelativeToProvenance(
  baseProvenance: string,
  relativePath: string,
): string {
  const basePath = addressPath(toLofsAddress(baseProvenance));
  const lastSlash = basePath.lastIndexOf('/');
  const baseDir = lastSlash >= 0 ? basePath.substring(0, lastSlash) : '';
  const joined = baseDir ? `${baseDir}/${relativePath}` : relativePath;

  const segments = joined.split('/');
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (resolved.length === 0) {
        throw new Error(`Path escapes root: "${relativePath}" from "${baseProvenance}"`);
      }
      resolved.pop();
      continue;
    }
    resolved.push(seg);
  }

  return resolved.join('/');
}
