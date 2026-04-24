// packages/shared/lib/lofs/address.ts
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
 * LOFS content address — what you ask for.
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
export type LofsAddress = string & { readonly __brand: 'LofsAddress' };

/**
 * LOFS provenance — what you got. An address with version resolved to
 * something immutable (commit hash, version number, snapshot id).
 *
 * Same string format as LofsAddress. The distinction is semantic:
 * an address might say @main (mutable ref), provenance says @3f41866 (immutable).
 */
export type LofsProvenance = LofsAddress & { readonly __resolved: true };

/**
 * LOFS source locator — identifies a specific content source.
 * The source part of an address, without version or path.
 *
 * Examples:
 *   git@github.com:olxhub/lo-blocks.git
 *   file:/home/user/content
 *   pg://school.edu/cs101
 *   memory:session-42
 */
export type LofsSourceLocator = string & { readonly __brand: 'LofsSourceLocator' };

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
 * LOFS version ref — a branch name, tag, or commit/version identifier.
 * This is the @version part of an address.
 *
 * For git: "main", "v2.1", "3f41866"
 * For postgres: "42", "v3"
 * For filesystem: not applicable (no versioning)
 *
 * Mutable refs (branches) resolve to immutable ones (commit SHAs) on read.
 */
export type LofsVersionRef = string & { readonly __brand: 'LofsVersionRef' };

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

export function toLofsAddress(s: string): LofsAddress {
  return s as LofsAddress;
}

export function toLofsProvenance(s: string): LofsProvenance {
  return s as LofsProvenance;
}

export function toLofsSourceLocator(s: string): LofsSourceLocator {
  return s as LofsSourceLocator;
}

export function toLofsContentPath(s: string): LofsContentPath {
  return s as LofsContentPath;
}

export function toLofsVersionRef(s: string): LofsVersionRef {
  return s as LofsVersionRef;
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
 * Split an address at the last "://" into source-with-version and path.
 * Returns [sourceWithVersion, path].
 */
function splitAtSeparator(address: string): [string, string] {
  const idx = address.lastIndexOf(SEPARATOR);
  if (idx === -1) {
    return [address, ''];
  }
  return [address.slice(0, idx), address.slice(idx + SEPARATOR.length)];
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
 * Extract the source locator from an address.
 *
 * source("git@github.com:olxhub/lo-blocks.git@main://content/foo.olx")
 *   → "git@github.com:olxhub/lo-blocks.git"
 */
export function source(address: LofsAddress): LofsSourceLocator {
  const [sourceWithVersion] = splitAtSeparator(address);
  const [src] = splitVersion(sourceWithVersion);
  return toLofsSourceLocator(src);
}

/**
 * Extract the version ref from an address, if present.
 *
 * version("git@github.com:olxhub/lo-blocks.git@3f41866://foo.olx")
 *   → "3f41866"
 * version("git@github.com:olxhub/lo-blocks.git://foo.olx")
 *   → undefined
 */
export function version(address: LofsAddress): LofsVersionRef | undefined {
  const [sourceWithVersion] = splitAtSeparator(address);
  const [, ver] = splitVersion(sourceWithVersion);
  return ver !== undefined ? toLofsVersionRef(ver) : undefined;
}

/**
 * Extract the path from an address.
 *
 * path("git@github.com:olxhub/lo-blocks.git://content/foo.olx")
 *   → "content/foo.olx"
 * path("git@github.com:olxhub/lo-blocks.git")
 *   → ""
 */
export function path(address: LofsAddress): LofsContentPath {
  const [, p] = splitAtSeparator(address);
  return toLofsContentPath(p);
}

/**
 * Return a new address with the version replaced (or added).
 *
 * withVersion("git@github.com:org/repo.git://foo.olx", "abc123")
 *   → "git@github.com:org/repo.git@abc123://foo.olx"
 * withVersion("git@github.com:org/repo.git@main://foo.olx", "abc123")
 *   → "git@github.com:org/repo.git@abc123://foo.olx"
 */
export function withVersion(address: LofsAddress, ver: LofsVersionRef): LofsAddress {
  const [sourceWithVersion, p] = splitAtSeparator(address);
  const [src] = splitVersion(sourceWithVersion);
  const pathSuffix = address.includes(SEPARATOR) ? `${SEPARATOR}${p}` : '';
  return toLofsAddress(`${src}@${ver}${pathSuffix}`);
}

/**
 * Return a new address with the version removed.
 */
export function withoutVersion(address: LofsAddress): LofsAddress {
  const [sourceWithVersion, p] = splitAtSeparator(address);
  const [src] = splitVersion(sourceWithVersion);
  const pathSuffix = address.includes(SEPARATOR) ? `${SEPARATOR}${p}` : '';
  return toLofsAddress(`${src}${pathSuffix}`);
}

/**
 * Return a new address with the path replaced.
 *
 * withPath("git@github.com:org/repo.git@main://old.olx", "new.olx")
 *   → "git@github.com:org/repo.git@main://new.olx"
 */
export function withPath(address: LofsAddress, newPath: LofsContentPath): LofsAddress {
  const [sourceWithVersion] = splitAtSeparator(address);
  return toLofsAddress(`${sourceWithVersion}${SEPARATOR}${newPath}`);
}

/**
 * Construct an address from parts.
 *
 * makeAddress("git@github.com:org/repo.git", "content/foo.olx", "main")
 *   → "git@github.com:org/repo.git@main://content/foo.olx"
 * makeAddress("memory:session-42", "draft.olx")
 *   → "memory:session-42://draft.olx"
 * makeAddress("git@github.com:org/repo.git")
 *   → "git@github.com:org/repo.git"
 */
export function makeAddress(
  src: LofsSourceLocator,
  p?: LofsContentPath,
  ver?: LofsVersionRef,
): LofsAddress {
  let result = src as string;
  if (ver) result += `@${ver}`;
  if (p !== undefined) result += `${SEPARATOR}${p}`;
  return toLofsAddress(result);
}

/**
 * Check if an address has a resolved version (i.e., is a provenance).
 * This is a structural check — it can't verify the version is truly
 * immutable (that's the source's job).
 */
export function hasVersion(address: LofsAddress): address is LofsProvenance {
  return version(address) !== undefined;
}

/**
 * Get the scheme prefix of a source locator.
 *
 * scheme("git@github.com:org/repo.git") → "git"   (SSH-style)
 * scheme("file:/home/user/content")    → "file"
 * scheme("pg://school.edu/cs101")       → "pg"
 * scheme("memory:session-42")           → "memory"
 */
export function scheme(address: LofsAddress): string {
  const src = source(address) as string;
  // SSH-style: "git@..."
  if (src.startsWith('git@')) return 'git';
  // URI-style: "scheme:..."
  const colonIdx = src.indexOf(':');
  if (colonIdx > 0) return src.slice(0, colonIdx);
  return '';
}
