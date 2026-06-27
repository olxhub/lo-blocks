// packages/shared/lib/types/address.ts
//
// Content address system — branded types and pure functions.
//
// Ported from prototypes/lofs/. This is the address grammar for
// LOFS content-addressed storage.
//
// An address is a string with up to three parts:
//   source://path[#version]
//
// Parsing rules:
//   1. Find the LAST "://" — everything before is the source,
//      everything after is the path-with-optional-version.
//      If no "://", the whole string is the source, path is empty.
//
//   2. In the path part, find "#". Everything before is the path,
//      everything after is the version. "#" is reserved — it
//      must not appear in paths or source locators.
//
// Why "last ://" works: source locators may contain "://" (like
// file://, pg://), but paths within a source never do.
//
// Why "#" works: "#" does not appear in file paths (by convention
// and by our locked-down path validation), source locators, git
// ref names (git forbids it), hostnames, or email addresses.
// Unlike the old "@version" format, there is no ambiguity with
// "@" in source locators (git SSH URLs, email-style identifiers).

// ═══════════════════════════════════════════════════════════════════════════════
// BRANDED TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * LOFS content reference — what you ask for.
 *
 * Format: source://path[#version]
 *
 * Examples:
 *   git@github.com:olxhub/lo-blocks.git://content/myfile.olx
 *   git@github.com:olxhub/lo-blocks.git://content/myfile.olx#main
 *   git@github.com:olxhub/lo-blocks.git://content/myfile.olx#3f41866
 *   file:/home/user/content://myfile.olx
 *   pg://school.edu/cs101://hw1/problem3.olx#v42
 *   memory:session-42://draft.olx
 */
export type LofsRef = string & { readonly __brand: 'LofsRef' };

/**
 * LOFS provenance — what you got. A reference with version resolved to
 * something immutable (commit hash, version number, snapshot id).
 *
 * Same string format as LofsRef. The distinction is semantic:
 * a ref might say #main (mutable), provenance says #3f41866 (immutable).
 */
export type LofsCanonical = LofsRef & { readonly __resolved: true };

/**
 * LOFS source — identifies a specific content source.
 * The source part of a reference, without version or path.
 * Used as the namespace qualifier for DefinitionKeys in cross-repo references.
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
  if (!s) throw new Error('LofsRef cannot be empty');
  return s as LofsRef;
}

export function toLofsCanonical(ref: LofsRef): LofsCanonical {
  if (!hasVersion(ref)) {
    throw new Error(`LofsCanonical requires a #version: "${ref}"`);
  }
  return ref as LofsCanonical;
}

export function toLofsOrigin(s: string): LofsOrigin {
  if (!s) throw new Error('LofsOrigin cannot be empty');
  if (s.includes(VERSION_DELIM)) throw new Error(`LofsOrigin must not contain "${VERSION_DELIM}": "${s}"`);
  return s as LofsOrigin;
}

export function toLofsContentPath(s: string): LofsContentPath {
  if (s.includes(VERSION_DELIM)) throw new Error(`LofsContentPath must not contain "${VERSION_DELIM}": "${s}"`);
  return s as LofsContentPath;
}

export function toLofsVersion(s: string): LofsVersion {
  if (!s) throw new Error('LofsVersion cannot be empty');
  return s as LofsVersion;
}

const CONTENT_HASH_RE = /^[0-9a-f]{8,64}$/;

export function toLofsContentHash(s: string): LofsContentHash {
  if (!CONTENT_HASH_RE.test(s)) {
    throw new Error(`LofsContentHash must be 8-64 hex characters: "${s}"`);
  }
  return s as LofsContentHash;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADDRESS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const SEPARATOR = '://';
const VERSION_DELIM = '#';

/**
 * Split a reference at the last "://" into source and path-with-version.
 * Returns [source, pathWithVersion].
 */
function splitAtSeparator(ref: string): [string, string] {
  const idx = ref.lastIndexOf(SEPARATOR);
  if (idx === -1) {
    return [ref, ''];
  }
  return [ref.slice(0, idx), ref.slice(idx + SEPARATOR.length)];
}

/**
 * Split a path-with-version string into [path, version | undefined].
 *
 * "#" is the version delimiter. It is reserved and must not appear in
 * paths or source locators.
 */
function splitVersion(pathWithVersion: string): [string, string | undefined] {
  const idx = pathWithVersion.indexOf(VERSION_DELIM);
  if (idx === -1) {
    return [pathWithVersion, undefined];
  }
  return [pathWithVersion.slice(0, idx), pathWithVersion.slice(idx + 1)];
}

/**
 * Extract the source from a reference.
 *
 * source("git@github.com:olxhub/lo-blocks.git://content/foo.olx#main")
 *   → "git@github.com:olxhub/lo-blocks.git"
 */
export function source(ref: LofsRef): LofsOrigin {
  const [src] = splitAtSeparator(ref);
  return toLofsOrigin(src);
}

/**
 * Extract the version from a reference, if present.
 *
 * version("git@github.com:olxhub/lo-blocks.git://foo.olx#3f41866")
 *   → "3f41866"
 * version("git@github.com:olxhub/lo-blocks.git://foo.olx")
 *   → undefined
 */
export function version(ref: LofsRef): LofsVersion | undefined {
  const [, pathWithVersion] = splitAtSeparator(ref);
  const [, ver] = splitVersion(pathWithVersion);
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
  const [, pathWithVersion] = splitAtSeparator(ref);
  const [p] = splitVersion(pathWithVersion);
  return toLofsContentPath(p);
}

/**
 * Return a new reference with the version replaced (or added).
 *
 * withVersion("git@github.com:org/repo.git://foo.olx", "abc123")
 *   → "git@github.com:org/repo.git://foo.olx#abc123"
 * withVersion("git@github.com:org/repo.git://foo.olx#main", "abc123")
 *   → "git@github.com:org/repo.git://foo.olx#abc123"
 */
export function withVersion(ref: LofsRef, ver: LofsVersion): LofsRef {
  if (!ref.includes(SEPARATOR)) {
    throw new Error(`withVersion requires a ref with "://": "${ref}"`);
  }
  const [src, pathWithVersion] = splitAtSeparator(ref);
  const [p] = splitVersion(pathWithVersion);
  return toLofsRef(`${src}${SEPARATOR}${p}${VERSION_DELIM}${ver}`);
}

/**
 * Return a new reference with the version removed.
 */
export function withoutVersion(ref: LofsRef): LofsRef {
  const [src, pathWithVersion] = splitAtSeparator(ref);
  const [p] = splitVersion(pathWithVersion);
  const pathSuffix = ref.includes(SEPARATOR) ? `${SEPARATOR}${p}` : '';
  return toLofsRef(`${src}${pathSuffix}`);
}

/**
 * Return a new reference with the path replaced.
 *
 * withPath("git@github.com:org/repo.git://old.olx#main", "new.olx")
 *   → "git@github.com:org/repo.git://new/path.olx#main"
 */
export function withPath(ref: LofsRef, newPath: LofsContentPath): LofsRef {
  const [src, pathWithVersion] = splitAtSeparator(ref);
  const [, ver] = splitVersion(pathWithVersion);
  const versionSuffix = ver !== undefined ? `${VERSION_DELIM}${ver}` : '';
  return toLofsRef(`${src}${SEPARATOR}${newPath}${versionSuffix}`);
}

/**
 * Construct a reference from parts.
 *
 * makeAddress("git@github.com:org/repo.git", "content/foo.olx", "main")
 *   → "git@github.com:org/repo.git://content/foo.olx#main"
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
  if (p !== undefined) result += `${SEPARATOR}${p}`;
  if (ver !== undefined) result += `${VERSION_DELIM}${ver}`;
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
 * scheme("git@github.com:org/repo.git://foo.olx")  → "git"   (SSH-style)
 * scheme("file:/home/user/content://foo.olx")      → "file"
 * scheme("pg://school.edu/cs101://hw1/p3.olx")     → "pg"
 * scheme("memory:session-42://draft.olx")           → "memory"
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

// ═══════════════════════════════════════════════════════════════════════════════
// GIT ORIGINS — canonical, transport-in-scheme, ref-bearing
// ═══════════════════════════════════════════════════════════════════════════════
//
// A git source's origin is canonicalized so that it (a) carries the branch/ref
// — without which two branches of one repo are indistinguishable in provenance
// — and (b) contains no "://", so the grammar's last-"://" rule finds the
// origin↔path boundary unambiguously.
//
// Canonicalizing is a SCHEME SWAP: drop the clone URL's scheme, prepend the git
// scheme, keep the locator verbatim, append "@<ref>". The transport lives in
// the scheme; the ref is always last, so it's the substring after the last "@"
// (any earlier "@" is ssh userinfo).
//
// GIT_TRANSPORTS is the single source of truth for both directions AND the
// test: each `examples` entry is "<clone-url>@<ref> → <origin>", so input and
// output differ only by the prefix. (The provider serves only git+https today;
// git+ssh and git: are valid identities it raises Unimplemented for at clone
// time.) No ssh:// (a bare ssh:// URL needn't be git — could be scp/rsync) and
// no git:// daemon (unused): the ssh form is scp, and git: is a local repo.

type GitTransport =
  | { scheme: string; strip: string; match?: undefined; examples: readonly string[] }
  | { scheme: string; match: RegExp; strip?: undefined; examples: readonly string[] };

export const GIT_TRANSPORTS: readonly GitTransport[] = [
  { scheme: 'git+https:', strip: 'https://',
    examples: ['https://github.com/olxhub/lo-blocks.git@main → git+https:github.com/olxhub/lo-blocks.git@main'] },
  { scheme: 'git+ssh:', match: /^[^@/\s]+@[^/\s]+:/,            // scp: user@host:path (no scheme to strip)
    examples: ['git@github.com:olxhub/lo-blocks.git@main → git+ssh:git@github.com:olxhub/lo-blocks.git@main'] },
  { scheme: 'git:', match: /^\//,                               // local filesystem repo
    examples: ['/home/pmitros/projects/lo-blocks@main → git:/home/pmitros/projects/lo-blocks@main'] },
];

/** Canonicalize a git clone URL + ref into a ref-bearing, "://"-free origin. */
export function gitOrigin(cloneUrl: string, ref: string): LofsOrigin {
  if (!ref) throw new Error('gitOrigin requires a ref');
  const url = cloneUrl.trim().replace(/\/+$/, '');
  for (const t of GIT_TRANSPORTS) {
    const matched = t.strip !== undefined ? url.startsWith(t.strip) : t.match.test(url);
    if (matched) {
      const locator = t.strip !== undefined ? url.slice(t.strip.length) : url;
      return toLofsOrigin(`${t.scheme}${locator}@${ref}`);
    }
  }
  throw new Error(`Unrecognized git clone URL: "${cloneUrl}"`);
}

/** Split a canonical git origin "<scheme>:<locator>@<ref>" into its parts. */
function parseGitOrigin(origin: LofsOrigin): { scheme: string; locator: string; ref: string } {
  const o = String(origin);
  const colon = o.indexOf(':');
  const at = o.lastIndexOf('@');
  if (colon < 0 || at < colon) throw new Error(`Not a ref-bearing git origin: "${origin}"`);
  return { scheme: o.slice(0, colon + 1), locator: o.slice(colon + 1, at), ref: o.slice(at + 1) };
}

/** The ref (branch/tag/commit) carried by a canonical git origin. */
export function gitOriginRef(origin: LofsOrigin): string {
  return parseGitOrigin(origin).ref;
}

/** Recover the clone URL from a canonical git origin — the inverse of gitOrigin. */
export function gitCloneUrl(origin: LofsOrigin): string {
  const { scheme, locator } = parseGitOrigin(origin);
  const t = GIT_TRANSPORTS.find(t => t.scheme === scheme);
  if (!t) throw new Error(`Not a git origin: "${origin}"`);
  return t.strip !== undefined ? t.strip + locator : locator;
}

/** Forge identity behind a web link — drives the icon and label the UI shows.
 *  A serializable token (not a component): this crosses the get_repositories
 *  wire, and the rendering layer maps it to an actual icon. */
export type Forge = 'github' | 'gitlab';

/** A browsable link to content on its forge: where, and how to present it.
 *  More than a URL because the UI needs the forge identity (for the icon) and
 *  a human label ("View on GitHub"). */
export interface ForgeLink {
  /** The browser URL — the repo at its ref, or a file within it. */
  url: string;
  /** Which forge; the UI resolves this to an icon. */
  forge: Forge;
  /** Action label, e.g. "View on GitHub". */
  label: string;
}

// Forges whose web UI follows the github.com path convention
// (…/tree/<ref> for a directory, …/blob/<ref>/<path> for a file).
const WEB_FORGES: Record<string, { forge: Forge; label: string }> = {
  'github.com': { forge: 'github', label: 'View on GitHub' },
  'gitlab.com': { forge: 'gitlab', label: 'View on GitLab' },
};

/**
 * The forge link for an origin — the repo at its ref when `path` is omitted, or
 * a specific file when given. Pure: derived from the origin, no network.
 *
 * Returns null when no web view is known — a non-git origin, a transport with
 * no canonical web UI (local `git:`, `git+ssh:`), or a forge host we don't map.
 * Callers must treat null as "no link available" (the caveat is the contract).
 */
export function forgeLink(origin: LofsOrigin, path?: string): ForgeLink | null {
  let parsed: { scheme: string; locator: string; ref: string };
  try {
    parsed = parseGitOrigin(origin);
  } catch {
    return null;                       // not a ref-bearing git origin
  }
  if (parsed.scheme !== 'git+https:') return null;   // only https forges have a web UI
  const locator = parsed.locator.replace(/\.git$/, '');   // "github.com/olxhub/repo"
  const host = locator.slice(0, locator.indexOf('/'));
  const known = WEB_FORGES[host];
  if (!known) return null;
  const base = `https://${locator}`;
  const rel = path ? String(path).replace(/^\/+/, '') : '';
  const url = rel ? `${base}/blob/${parsed.ref}/${rel}` : `${base}/tree/${parsed.ref}`;
  return { url, forge: known.forge, label: known.label };
}
