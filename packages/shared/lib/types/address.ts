// packages/shared/lib/types/address.ts
//
// Content address system — branded types and pure functions.
//
// Ported from prototypes/lofs/. This is the address grammar for
// LOFS content-addressed storage.
//
// An address is a string with up to three parts:
//   source-locator[@version]://path
//
// Parsing rules:
//   1. Find the LAST "://" — everything after is the path,
//      everything before is the source-with-optional-version.
//      If no "://", the whole string is the source, path is empty.
//
//   2. In the source part, find the LAST "@". If the text after
//      that "@" matches /^[a-zA-Z0-9._-]+$/ (no ":", "/", "@"),
//      it's the version. Otherwise, no version.
//
// Why "last ://" works: source locators may contain "://" (like
// file://, pg://), but paths within a source never do.
//
// Why "last @ with restricted charset" works: git SSH URLs contain
// "@" (git@github.com) but the text after that "@" contains ":" and
// "/", so it's never mistaken for a version.

// ═══════════════════════════════════════════════════════════════════════════════
// BRANDED TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * LOFS content reference — what you ask for.
 *
 * Format: source-locator[@version]://path
 *
 * Examples:
 *   git@github.com:olxhub/lo-blocks.git://content/myfile.olx
 *   git@github.com:olxhub/lo-blocks.git@main://content/myfile.olx
 *   git@github.com:olxhub/lo-blocks.git@3f41866://content/myfile.olx
 *   file:/home/user/content://myfile.olx
 *   pg://school.edu/cs101@v42://hw1/problem3.olx
 *   memory:session-42://draft.olx
 */
export type LofsRef = string & { readonly __brand: 'LofsRef' };

/**
 * LOFS provenance — what you got. A reference with version resolved to
 * something immutable (commit hash, version number, snapshot id).
 *
 * Same string format as LofsRef. The distinction is semantic:
 * a ref might say @main (mutable), provenance says @3f41866 (immutable).
 */
export type LofsCanonical = LofsRef & { readonly __resolved: true };

/**
 * LOFS source — identifies a specific content source.
 * The source part of a reference, without version or path.
 * Used as the namespace qualifier for OlxKeys in cross-repo references.
 *
 * Examples:
 *   git@github.com:olxhub/lo-blocks.git
 *   file:/home/user/content
 *   pg://school.edu/cs101
 *   memory:session-42
 */
export type LofsOrigin = string & { readonly __brand: 'LofsOrigin' };

/**
 * LOFS content path — a path within a source. Always relative (no leading /).
 *
 * Examples:
 *   content/myfile.olx
 *   hw1/problem3.olx
 *   (empty string = root)
 */
export type LofsContentPath = string & { readonly __brand: 'LofsContentPath' };

/**
 * LOFS version — a branch name, tag, or commit/version identifier.
 * This is the @version part of a reference.
 *
 * For git: "main", "v2.1", "3f41866"
 * For postgres: "42", "v3"
 * For filesystem: not applicable (no versioning)
 *
 * Mutable refs (branches) resolve to immutable ones (commit SHAs) on read.
 */
export type LofsVersion = string & { readonly __brand: 'LofsVersion' };

/**
 * LOFS content hash — SHA-256 hex digest of the file content itself.
 *
 * Provider-independent: same content = same hash regardless of where it's
 * stored. This is the content-addressable identity — the leaf of the merkle DAG.
 *
 * Distinct from provider-specific identity (which might be mtime, blob OID,
 * version integer, etc.) and from version refs (which identify points in
 * a repo's history, not specific file content).
 */
export type LofsContentHash = string & { readonly __brand: 'LofsContentHash' };

// ═══════════════════════════════════════════════════════════════════════════════
// BRANDING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function toLofsRef(s: string): LofsRef {
  return s as LofsRef;
}

export function toLofsCanonical(ref: LofsRef): LofsCanonical {
  return ref as LofsCanonical;
}

export function toLofsOrigin(s: string): LofsOrigin {
  return s as LofsOrigin;
}

export function toLofsContentPath(s: string): LofsContentPath {
  return s as LofsContentPath;
}

export function toLofsVersion(s: string): LofsVersion {
  return s as LofsVersion;
}

export function toLofsContentHash(s: string): LofsContentHash {
  return s as LofsContentHash;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADDRESS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const SEPARATOR = '://';
const VERSION_CHARS = /^[a-zA-Z0-9._-]+$/;

/**
 * Split a reference at the last "://" into source-with-version and path.
 * Returns [sourceWithVersion, path].
 */
function splitAtSeparator(ref: string): [string, string] {
  const idx = ref.lastIndexOf(SEPARATOR);
  if (idx === -1) {
    return [ref, ''];
  }
  return [ref.slice(0, idx), ref.slice(idx + SEPARATOR.length)];
}

/**
 * Split a source-with-version string into [source, version | undefined].
 *
 * Finds the last "@" and checks if what follows is a valid version
 * (alphanumeric, dots, hyphens, underscores — no colons, slashes, or @).
 */
function splitVersion(sourceWithVersion: string): [string, string | undefined] {
  const idx = sourceWithVersion.lastIndexOf('@');
  if (idx === -1) {
    return [sourceWithVersion, undefined];
  }
  const candidate = sourceWithVersion.slice(idx + 1);
  if (candidate.length > 0 && VERSION_CHARS.test(candidate)) {
    return [sourceWithVersion.slice(0, idx), candidate];
  }
  return [sourceWithVersion, undefined];
}

/**
 * Extract the source from a reference.
 *
 * source("git@github.com:olxhub/lo-blocks.git@main://content/foo.olx")
 *   → "git@github.com:olxhub/lo-blocks.git"
 */
export function source(ref: LofsRef): LofsOrigin {
  const [sourceWithVersion] = splitAtSeparator(ref);
  const [src] = splitVersion(sourceWithVersion);
  return toLofsOrigin(src);
}

/**
 * Extract the version from a reference, if present.
 *
 * version("git@github.com:olxhub/lo-blocks.git@3f41866://foo.olx")
 *   → "3f41866"
 * version("git@github.com:olxhub/lo-blocks.git://foo.olx")
 *   → undefined
 */
export function version(ref: LofsRef): LofsVersion | undefined {
  const [sourceWithVersion] = splitAtSeparator(ref);
  const [, ver] = splitVersion(sourceWithVersion);
  return ver !== undefined ? toLofsVersion(ver) : undefined;
}

/**
 * Extract the path from a reference.
 *
 * addressPath("git@github.com:olxhub/lo-blocks.git://content/foo.olx")
 *   → "content/foo.olx"
 * addressPath("git@github.com:olxhub/lo-blocks.git")
 *   → ""
 */
export function addressPath(ref: LofsRef): LofsContentPath {
  const [, p] = splitAtSeparator(ref);
  return toLofsContentPath(p);
}

/**
 * Return a new reference with the version replaced (or added).
 *
 * withVersion("git@github.com:org/repo.git://foo.olx", "abc123")
 *   → "git@github.com:org/repo.git@abc123://foo.olx"
 * withVersion("git@github.com:org/repo.git@main://foo.olx", "abc123")
 *   → "git@github.com:org/repo.git@abc123://foo.olx"
 */
export function withVersion(ref: LofsRef, ver: LofsVersion): LofsRef {
  const [sourceWithVersion, p] = splitAtSeparator(ref);
  const [src] = splitVersion(sourceWithVersion);
  const pathSuffix = ref.includes(SEPARATOR) ? `${SEPARATOR}${p}` : '';
  return toLofsRef(`${src}@${ver}${pathSuffix}`);
}

/**
 * Return a new reference with the version removed.
 */
export function withoutVersion(ref: LofsRef): LofsRef {
  const [sourceWithVersion, p] = splitAtSeparator(ref);
  const [src] = splitVersion(sourceWithVersion);
  const pathSuffix = ref.includes(SEPARATOR) ? `${SEPARATOR}${p}` : '';
  return toLofsRef(`${src}${pathSuffix}`);
}

/**
 * Return a new reference with the path replaced.
 *
 * withPath("git@github.com:org/repo.git@main://old.olx", "new.olx")
 *   → "git@github.com:org/repo.git@main://new/path.olx"
 */
export function withPath(ref: LofsRef, newPath: LofsContentPath): LofsRef {
  const [sourceWithVersion] = splitAtSeparator(ref);
  return toLofsRef(`${sourceWithVersion}${SEPARATOR}${newPath}`);
}

/**
 * Construct a reference from parts.
 *
 * makeAddress("git@github.com:org/repo.git", "content/foo.olx", "main")
 *   → "git@github.com:org/repo.git@main://content/foo.olx"
 * makeAddress("memory:session-42", "draft.olx")
 *   → "memory:session-42://draft.olx"
 * makeAddress("git@github.com:org/repo.git")
 *   → "git@github.com:org/repo.git"
 */
export function makeAddress(
  src: LofsOrigin,
  p?: LofsContentPath,
  ver?: LofsVersion,
): LofsRef {
  let result = src as string;
  if (ver) result += `@${ver}`;
  if (p !== undefined) result += `${SEPARATOR}${p}`;
  return toLofsRef(result);
}

/**
 * Check if a reference has a version.
 * Structural check — can't verify the version is truly immutable.
 */
export function hasVersion(ref: LofsRef): boolean {
  return version(ref) !== undefined;
}

/**
 * Get the scheme prefix of a source.
 *
 * scheme("git@github.com:org/repo.git://foo.olx") → "git"   (SSH-style)
 * scheme("file:/home/user/content://foo.olx")     → "file"
 * scheme("pg://school.edu/cs101://hw1/p3.olx")    → "pg"
 * scheme("memory:session-42://draft.olx")          → "memory"
 */
export function scheme(ref: LofsRef): string {
  const src = source(ref) as string;
  // SSH-style: "git@..."
  if (src.startsWith('git@')) return 'git';
  // URI-style: "scheme:..."
  const colonIdx = src.indexOf(':');
  if (colonIdx > 0) return src.slice(0, colonIdx);
  return '';
}
