// packages/shared/lib/util/posixPath.ts
//
// Caveat-emptor Windows support.
//
// LOFS refs/URIs are POSIX by contract: toFileRef() (types/storage.ts) throws
// on any path containing a backslash. But Node's `path` helpers
// (relative/normalize/join) emit OS-native separators, so on Windows they
// produce backslashes. Any path that crosses the seam from the real
// filesystem into a ref/URI must therefore be funneled through here first.
//
// On Linux — our native, CI-tested platform — path.sep is already '/', so
// this is a no-op and costs nothing. We do NOT run CI on Windows, so Windows
// is best-effort: this keeps the filesystem→ref seams honest
//
// lo-blocks works fine under WSL, and we were a bit surprised from an
// external PR that it works fine on Windows **without** WSL, so we're
// applying this fix, but Windows-native support is caveat emptor. :)

import path from 'path';

/**
 * Convert an OS-native filesystem path to a POSIX path (forward slashes).
 *
 * Splits on path.sep (not a blanket backslash replace) so that on Linux a
 * literal backslash in a filename — a legal character there — survives
 * untouched. On Windows path.sep is '\\' and filenames can't contain it, so
 * the conversion is unambiguous.
 */
export function windowsToPosix(p: string): string {
  return p.split(path.sep).join('/');
}
