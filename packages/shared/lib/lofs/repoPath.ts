// packages/shared/lib/lofs/repoPath.ts
//
// SERVER-ONLY. The content API routes run toRepoRelativePath on a raw, untrusted
// `?path=` before handing it to a provider — the conversion that earns the
// RepoRelativePath brand (see types/core.ts for the type).
//
// Server-only because it uses Node `path`. It can't live in types/storage.ts
// (client-bundled via NetworkStorageProvider; no Node `path` polyfill here), so
// the brand TYPE lives in core.ts and this CONSTRUCTOR lives beside the other
// server-only path code (resolveSafeReadPath/WritePath in providers/file.ts).
//
// This is a first-line boundary check + brand. The authoritative enforcement is
// still the provider's resolveSafeReadPath/WritePath (realpath + symlink + the
// allowed-dir list) — defense in depth.
//
// TODO: Figure out the right way / place to do this, and a holistic TS cleanup
// for all of LOFS. 
//
// This is interim code until we're ready. Better than what we had
// before, but not good.

import path from 'path';
import { toOlxRelativePath } from '@/lib/types/storage';
import { extensionsWithDots, CATEGORY } from '@/lib/util/fileTypes';
import type { RepoRelativePath } from '@/lib/types';

/**
 * Validate and brand an untrusted, repo-relative content path.
 *
 * Composes the two hardened pieces rather than re-implementing either:
 *   - toOlxRelativePath: the shared per-segment allowlist (rejects "#", control
 *     chars, backslashes, shell/URI-unsafe chars, and absolute paths). Because
 *     backslashes are rejected here, the input below is guaranteed POSIX.
 *   - path.posix.normalize: the battle-tested fold of "." / "..". Explicitly
 *     POSIX (not platform `path`), so a Windows server can't turn "/" into "\"
 *     or change traversal semantics.
 * A normalized path that still starts with ".." (or "/") escaped its source.
 * Finally it must point at a recognized content file.
 *
 * Throws on any failure (the route maps the throw to a 400).
 *
 * @example toRepoRelativePath("unit1/lesson.olx")  // → "unit1/lesson.olx"
 * @example toRepoRelativePath("a/../b.olx")          // → "b.olx"
 * @example toRepoRelativePath("../secrets.olx")      // throws — escapes the source
 * @example toRepoRelativePath("..\\..\\x.olx")       // throws — backslash segment
 * @example toRepoRelativePath("evil.sh")             // throws — not a content file
 */
export function toRepoRelativePath(input: string): RepoRelativePath {
  toOlxRelativePath(input);  // shared char-safety gate (throws on bad segment / absolute / empty)

  const normalized = path.posix.normalize(input);
  if (normalized.startsWith('..') || normalized.startsWith('/')) {
    throw new Error(`toRepoRelativePath: path escapes its source: "${input}"`);
  }

  const allowed = extensionsWithDots(CATEGORY.content);
  if (!allowed.some(ext => normalized.endsWith(ext))) {
    throw new Error(`toRepoRelativePath: not a content file (allowed: ${allowed.join(', ')}): "${input}"`);
  }

  return normalized as RepoRelativePath;
}
