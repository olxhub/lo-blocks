// packages/shared/lib/lofs/providers/git.ts
//
// Git storage provider — content served directly from a git remote.
//
// In-memory, forge-agnostic, read AND write:
//
// - Speaks the plain git smart-HTTP protocol via isomorphic-git, so
//   GitHub / GitLab / Forgejo / Codeberg / a bare repo behind nginx are
//   indistinguishable. No forge APIs.
// - The repository lives in an in-memory filesystem (memfs). No working
//   clone on disk, no git binary, nothing for dev-ops to manage — and no
//   path by which repo-supplied code could ever be executed.
// - Change detection is one request: the remote's branch head SHA, checked
//   at most once per cooldown period (throttle-friendly). Only on a head
//   change does the provider refetch, and the scan reports exact
//   added/changed/deleted from per-file blob SHAs — no mtime heuristics.
// - Versions are honest: every ref carries the blob SHA as its #version,
//   the inhabitant LofsCanonical was designed around. Provenance uses the
//   repo URL as the origin (`<url>://<path-in-repo>#<sha>`), per the
//   address grammar's git examples.
//
// Writes (commit-on-write — see docs/content-in-git.md):
// - A write builds a new tree by plumbing (writeBlob + writeTree from the
//   current commit's tree), commits it with parent = current head, and
//   pushes. No working tree / index — the clone stays noCheckout.
// - The platform commits on the AUTHOR's behalf: commit author = the teacher
//   (WriteOptions.author, from CurrentUser); committer = the platform
//   identity. Author rides per-write because one provider instance is shared
//   across users (see contentSources memoization).
// - Conflict detection has two layers: optimistic (read's blob-oid in
//   previousMetadata vs current) and authoritative (a non-fast-forward push
//   is rejected). Both surface as VersionConflictError → HTTP 409 upstream.
// - Writes are serialized per provider (writeLock): concurrent writes to
//   different files must not both fork from the same head and spuriously
//   collide at push.
//
// Auth: an injected credential resolver (GitProviderOptions.auth) supplies
// isomorphic-git onAuth for listServerRefs / clone / push — this is what
// enables private-repo reads AND pushes. Today the resolver yields a
// deploy-level token (a GitHub PAT; isomorphic-git has no SSH yet), so all
// pushes authenticate as one service identity and --author distinguishes
// teachers. When per-user OAuth lands, push credentials become per-write
// (the writing teacher's token), resolved at write time rather than baked
// into the shared instance. Reads stay deploy-level (audience-independent).
//
// Network use:
//   - listServerRefs: 1 small request per cooldown window
//   - clone (singleBranch, depth 1, noCheckout): only when the head moved
//   - push: once per write
//
// On a head change the volume is discarded and re-cloned. Repos are small;
// a fresh shallow clone is simpler and safer than incremental fetch edge
// cases. Revisit if repo size ever makes this slow.

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { Volume } from 'memfs';
import YAML from 'yaml';
import { minimatch } from 'minimatch';
import { isContentFile, isMediaFile, getExtension } from '@/lib/util/fileTypes';
import type { LofsRef, OlxRelativePath, SafeRelativePath } from '../../types';
import {
  type StorageProvider,
  type NamespaceResolution,
  type XmlFileInfo,
  type XmlScanResult,
  type FileSelection,
  type UriNode,
  type ReadResult,
  type WriteOptions,
  type GrepOptions,
  type GrepMatch,
  NamespaceResolutionError,
  VersionConflictError,
} from '../../types/storage';
import {
  source, addressPath, withVersion, withoutVersion,
  makeAddress, gitOrigin, toLofsContentPath, toLofsVersion, toLofsCanonical,
  toLofsRef as brandLofsRef,
  type LofsOrigin, type LofsVersion,
} from '../../types/address';
import { type ContentNamespace, validateContentNamespace, asContentNamespace, defaultNamespace } from '../../types/id-grammar';
import { fileTypes } from '../fileTypes';
import { withRetry, throttle, singleFlight, type RetryPolicy } from '../../util/async';

const REPO_DIR = '/repo';

// Retry transient git transport failures (network blips, a flaky forge). A
// persistently failing remote is then backed off by the throttle in the
// refresh gate, so this never storms a down host.
const GIT_RETRY: RetryPolicy = { attempts: 3, baseMs: 200, maxMs: 2000 };

/** Platform identity recorded as the COMMITTER on every commit. The author
 *  is the teacher (WriteOptions.author); this is who physically committed.
 *  Also the author fallback when a write supplies none. */
const PLATFORM_IDENTITY = { name: 'Learning Observer', email: 'noreply@learning-observer.org' };

/** Strip a leading "./" or "/" so a client path becomes repo-relative. */
function stripLeadingSlash(p: string): string {
  return p.replace(/^\.?\//, '');
}

/** Normalize a basePath into a clean directory prefix ("a/b/"), or "" for no
 *  filter. Strips a leading "./" or "/" and ensures a single trailing slash. */
function basePrefix(basePath?: OlxRelativePath): string {
  return basePath ? stripLeadingSlash(String(basePath)).replace(/\/$/, '') + '/' : '';
}

/** isomorphic-git onAuth return shape (subset we use). */
export type GitCredentials = { username?: string; password?: string; headers?: Record<string, string> };

/** Resolves credentials for a repo's transport (reads + pushes). Returns null
 *  for anonymous access (public repos). Async so a future implementation can
 *  fetch a per-user OAuth token. */
export type GitCredentialResolver = () => GitCredentials | null | Promise<GitCredentials | null>;

export interface GitProviderOptions {
  /** Remote URL (https smart-HTTP; any forge or bare repo). */
  url: string;
  /** Branch to serve (default: main). */
  ref?: string;
  /** Subtree(s) within the repo to serve (default: the whole repo). A file
   *  is served if it sits under any listed directory. Paths stay
   *  repo-relative — NOT stripped — so they map 1:1 to repo paths, which the
   *  commit-on-write path needs. Accepts a string or a list; "/" and ""
   *  both mean the whole repo. */
  dir?: string | string[];
  /** Minimum ms between remote head checks (default: 60s). */
  cooldownMs?: number;
  /** Credential resolver for private reads and pushes (default: anonymous). */
  auth?: GitCredentialResolver;
}

/** A file in the current served tree: repo-relative path → blob oid. */
interface TreeFile {
  oid: string;
}

/** An immutable snapshot of the in-memory repo, swapped as ONE reference and
 *  never mutated field-by-field: the object store (vol), the branch head it
 *  names, and the served-file index at that head. Because git objects are
 *  content-addressed and immutable, an operation that captures `this.state`
 *  once holds a fully consistent view no matter what a concurrent refresh
 *  does — git's own model (immutable objects + atomic ref repoint) applied to
 *  the provider's local state. */
interface RepoState {
  vol: Volume;
  head: string;
  tree: Map<string, TreeFile>;
}

export class GitStorageProvider implements StorageProvider {
  readonly url: string;
  readonly ref: string;
  /** Repo subtrees to serve, as clean prefixes (no leading/trailing slash).
   *  Empty = the whole repo (no filter). */
  readonly contentDirs: string[];
  readonly cooldownMs: number;
  /** Canonical, ref-bearing origin (address.ts `gitOrigin`) — the identity for
   *  this source's refs. Carries the branch, so two branches of one repo are
   *  distinct origins. The raw `url` is just how we fetch/push. */
  readonly origin: LofsOrigin;

  /** The current repo snapshot, or null until the first successful refresh.
   *  The ONE mutable pointer on this provider; refresh and commit publish by
   *  repointing it to a new RepoState (a single assignment), never by mutating
   *  the existing one in place. Every operation captures it once
   *  (requireState) and works against that stable value. */
  private state: RepoState | null = null;
  /** The refresh, gated by composed wrappers (outer→inner):
   *   - throttle: ≤ one attempt per cooldown; caches the result (success OR
   *     failure) for the window, so a down remote isn't re-hit every call.
   *   - singleFlight: only ONE refresh runs at a time, independent of cooldown.
   *   - withRetry: retry transient blips within a single attempt.
   *  Built here so it closes over the instance. */
  private readonly refreshGate: () => Promise<void>;

  /** Optional credential resolver (private reads + pushes). */
  private readonly auth?: GitCredentialResolver;

  /** Serializes mutations. Two concurrent writes must not both fork a commit
   *  from the same head and then collide at push — chain them. */
  private writeLock: Promise<unknown> = Promise.resolve();

  constructor({ url, ref = 'main', dir, cooldownMs = 60_000, auth }: GitProviderOptions) {
    this.url = url.replace(/\/$/, '');
    this.ref = ref;
    this.contentDirs = (Array.isArray(dir) ? dir : dir === undefined ? [] : [dir])
      .map(d => d.replace(/^\/+|\/+$/g, ''))
      .filter(d => d !== '');  // "" and "/" both mean the whole repo → no filter
    this.cooldownMs = cooldownMs;
    this.auth = auth;
    this.origin = gitOrigin(this.url, this.ref);  // validates + canonicalizes the transport
    // The grammar admits git+ssh and git: origins; this provider serves only
    // git+https (isomorphic-git speaks smart-HTTP, not ssh, and local-repo
    // backing is a later store). Fail fast with a clear message rather than an
    // opaque clone error.
    if (!this.url.startsWith('https://')) {
      throw new Error(
        `GitStorageProvider serves git+https only; "${this.url}" is a valid origin ` +
        `but its transport isn't implemented yet.`
      );
    }
    this.refreshGate = throttle(singleFlight(withRetry(() => this.refresh(), GIT_RETRY)), this.cooldownMs);
  }

  /** isomorphic-git onAuth callback — yields resolved credentials, or {} for
   *  anonymous access (public repos). */
  protected onAuth = async (): Promise<GitCredentials> => (await this.auth?.()) ?? {};

  /** Run `fn` after any in-flight mutation completes (serial mutation queue). */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeLock.then(fn, fn);
    this.writeLock = run.then(() => undefined, () => undefined);
    return run;
  }

  /** The loaded snapshot — ensureFresh() must have run first. Capture it ONCE
   *  per operation (`const s = this.requireState()`) and read s.vol/head/tree
   *  throughout, so a concurrent refresh repoint can't tear the view. */
  private requireState(): RepoState {
    if (!this.state) throw new Error(`${this.url}#${this.ref} is not loaded`);
    return this.state;
  }

  /** Is this repo-relative path within the served subtree(s)? */
  private included(repoPath: string): boolean {
    if (this.contentDirs.length === 0) return true;  // whole repo
    return this.contentDirs.some(d => repoPath === d || repoPath.startsWith(`${d}/`));
  }

  // ---------------------------------------------------------------------
  // Remote sync
  // ---------------------------------------------------------------------

  /** Fetch the remote head SHA. Overridable seam: tests use a local repo. */
  protected async fetchRemoteHead(): Promise<string> {
    const refs = await git.listServerRefs({
      http,
      url: this.url,
      prefix: `refs/heads/${this.ref}`,
      onAuth: this.onAuth,
    });
    const match = refs.find(r => r.ref === `refs/heads/${this.ref}`);
    if (!match) {
      throw new Error(`Branch "${this.ref}" not found on ${this.url}`);
    }
    return match.oid;
  }

  /** Clone the remote at the current head into a FRESH volume and return it.
   *  Returns the volume so refresh() can assemble a complete snapshot and
   *  publish it by one atomic repoint — a failed clone never replaces the live
   *  snapshot. */
  protected async cloneRemote(): Promise<Volume> {
    const vol = new Volume();
    await git.clone({
      fs: { promises: vol.promises } as any,
      http,
      dir: REPO_DIR,
      url: this.url,
      ref: this.ref,
      singleBranch: true,
      depth: 1,
      noCheckout: true,
      noTags: true,
      onAuth: this.onAuth,
    });
    return vol;
  }

  /** Ensure the in-memory repo reflects the remote. Timing (one attempt per
   *  cooldown), concurrent-call coalescing, transient-failure retry, and
   *  down-remote backoff all live in refreshGate (see the field). */
  private ensureFresh(): Promise<void> {
    return this.refreshGate();
  }

  private async refresh(): Promise<void> {
    const remoteHead = await this.fetchRemoteHead();
    if (remoteHead === this.state?.head) return;

    // Build the whole snapshot in a local, then publish by a single atomic
    // repoint. A failed clone/walk leaves the previous snapshot intact — and
    // since head is unchanged, the next refresh retries rather than serving a
    // half-built volume.
    const vol = await this.cloneRemote();
    const head = await git.resolveRef({
      fs: { promises: vol.promises } as any,
      dir: REPO_DIR,
      ref: this.ref,
    });
    const tree = await this.walkTree(vol, head);
    this.state = { vol, head, tree };
  }

  /** Enumerate content files (path → blob oid) under contentDir at `head`. */
  private async walkTree(vol: Volume, head: string): Promise<Map<string, TreeFile>> {
    const files = new Map<string, TreeFile>();
    await git.walk({
      fs: { promises: vol.promises } as any,
      dir: REPO_DIR,
      trees: [git.TREE({ ref: head })],
      map: async (filepath, [entry]) => {
        if (!entry || filepath === '.') return;
        if ((await entry.type()) !== 'blob') return;
        if (!this.included(filepath)) return;
        const base = filepath.split('/').pop()!;
        if (!isContentFile(filepath) && base !== 'manifest.yaml') return;
        if (base.startsWith('.') || base.includes('~') || base.includes('#')) return;
        files.set(filepath, { oid: (await entry.oid()) });
      },
    });
    return files;
  }

  /** Read a blob by repo-relative path at the snapshot's head. */
  private async readBlob(s: RepoState, repoPath: string): Promise<string> {
    const { blob } = await git.readBlob({
      fs: { promises: s.vol.promises } as any,
      dir: REPO_DIR,
      oid: s.head,
      filepath: repoPath,
    });
    return new TextDecoder('utf-8').decode(blob);
  }

  // ---------------------------------------------------------------------
  // Refs: <canonical-git-origin>://<path-in-repo>#<blob-sha>
  //   e.g. git+https:github.com/olxhub/lo-blocks.git@main://unit1/x.olx#<sha>
  // ---------------------------------------------------------------------

  private toRef(repoPath: string): LofsRef {
    return makeAddress(this.origin, toLofsContentPath(repoPath));
  }

  /** Repo-relative path from one of OUR refs. Throws on refs from another
   *  origin — how the mount router's fallthrough finds the owning provider. */
  private ownPath(ref: LofsRef | string): string {
    const branded = brandLofsRef(String(ref));
    if (String(source(branded)) !== String(this.origin)) {
      throw new Error(`Not a ref of ${this.origin}: ${ref}`);
    }
    return String(addressPath(withoutVersion(branded)));
  }

  /** The #version stamped on a content file's ref: the blob SHA — object
   *  identity, stable across commits, so unchanged files stay "unchanged" in
   *  the scan. SINGLE FLIP SEAM for version policy: to stamp the commit SHA
   *  instead (more lineage context), return the head here and thread it from
   *  the call sites. Every file would then look changed each commit — the scan
   *  re-parses the snapshot — which is acceptable, since a head move already
   *  re-clones the whole repo. */
  private contentVersion(blobOid: string): LofsVersion {
    return toLofsVersion(blobOid);
  }

  private guardPath(p: string): string {
    if (p.includes('\0') || p.split('/').some(s => s === '..') || p.startsWith('/')) {
      throw new Error(`Invalid path: ${p}`);
    }
    return p;
  }

  // ---------------------------------------------------------------------
  // StorageProvider
  // ---------------------------------------------------------------------

  async loadXmlFilesWithStats(previous: Record<LofsRef, XmlFileInfo> = {}): Promise<XmlScanResult> {
    await this.ensureFresh();
    const s = this.requireState();

    // Only diff against our own refs (stacked/router scans pass everyone's).
    const mine: Record<string, XmlFileInfo> = {};
    for (const [key, info] of Object.entries(previous)) {
      try { this.ownPath(key); mine[key] = info; } catch { /* foreign */ }
    }

    const added: Record<LofsRef, XmlFileInfo> = {};
    const changed: Record<LofsRef, XmlFileInfo> = {};
    const unchanged: Record<LofsRef, XmlFileInfo> = {};
    const found = new Set<string>();

    for (const [relPath, { oid }] of s.tree) {
      const ref = this.toRef(relPath);
      const key = String(ref);
      found.add(key);
      const id = toLofsCanonical(withVersion(ref, this.contentVersion(oid)));
      const ext = getExtension(relPath) || relPath.split('.').pop() || '';
      const type = (fileTypes as any)[ext] ?? ext;
      const prev = mine[key];
      if (prev && prev.id === id) {
        unchanged[key as LofsRef] = prev;
      } else {
        const record: XmlFileInfo = {
          id,
          type,
          _metadata: { oid, head: s.head },
          content: await this.readBlob(s, relPath),
        };
        (prev ? changed : added)[key as LofsRef] = record;
      }
    }

    const deleted: Record<LofsRef, XmlFileInfo> = {};
    for (const [key, info] of Object.entries(mine)) {
      if (!found.has(key)) deleted[key as LofsRef] = info;
    }

    return { added, changed, unchanged, deleted };
  }

  async read(p: OlxRelativePath): Promise<ReadResult> {
    // TODO(stale-read): ensureFresh throws if a head re-check fails within the
    // cooldown, even when the snapshot's tree still holds the blob. A studio read during
    // a transient remote blip would degrade more gracefully by serving the
    // last-known content than by throwing. Safe as-is: the sync path tolerates
    // it (mount-router isolation + snapshot retention).
    await this.ensureFresh();
    const s = this.requireState();
    const relPath = this.guardPath(stripLeadingSlash(String(p)));
    // Honor the configured subtree(s): a path outside `dir` is not served,
    // even though the whole repo is in memfs. Scan/glob/grep already filter
    // via included(); the direct-blob fallback below must too, or a read
    // could reach repo content the operator chose not to serve.
    if (!this.included(relPath)) {
      throw new Error(`File not found: ${p} (outside served subtree of ${this.url}#${this.ref})`);
    }
    const entry = s.tree.get(relPath);
    if (!entry) {
      // Tree only indexes content files; for other reads, try the blob directly.
      try {
        const content = await this.readBlob(s, relPath);
        return {
          content,
          metadata: { head: s.head },
          provenance: toLofsCanonical(withVersion(this.toRef(relPath), toLofsVersion(s.head))),
          ns: await this.tryNamespace(relPath),
        };
      } catch {
        throw new Error(`File not found: ${p} (in ${this.url}#${this.ref})`);
      }
    }
    return {
      content: await this.readBlob(s, relPath),
      metadata: { oid: entry.oid, head: s.head },
      provenance: toLofsCanonical(withVersion(this.toRef(relPath), this.contentVersion(entry.oid))),
      ns: await this.tryNamespace(relPath),
    };
  }

  private async tryNamespace(relPath: string): Promise<ContentNamespace | undefined> {
    try {
      return (await this.namespaceFor(this.toRef(relPath))).ns;
    } catch (err) {
      if (err instanceof NamespaceResolutionError) return undefined;
      throw err;
    }
  }

  /**
   * Resolution: nearest ancestor manifest.yaml with a `namespace:` field,
   * else the repo name (defaultNamespace of the remote URL).
   *
   * The repo-name default is the deliberate difference from
   * FileStorageProvider's directory-name fallback: a git repo IS a content
   * collection, identified by its URL, so directory structure inside it is
   * free organization — not a namespace signal. (FileStorageProvider serves
   * one mount holding many collections, where the top-level directory is the
   * only thing that names them.) Manifests override: a repo holding several
   * sub-collections puts a manifest in each subtree.
   */
  async namespaceFor(ref: LofsRef): Promise<NamespaceResolution> {
    const relPath = this.ownPath(ref);
    await this.ensureFresh();
    const s = this.requireState();

    // 1. Manifest walk, nearest first. Manifests are read by blob, not via
    //    s.tree (the content-file index): a configured `dir` subtree trims the
    //    index but not the cloned volume, so an ancestor manifest above the
    //    served subtree still governs the content beneath it.
    const segments = relPath.split('/').slice(0, -1);
    for (let i = segments.length; i >= 0; i--) {
      const manifestRel = [...segments.slice(0, i), 'manifest.yaml'].join('/');
      let raw: string;
      try { raw = await this.readBlob(s, manifestRel); } catch { continue; }  // none at this level
      const declared = YAML.parse(raw)?.namespace;
      if (declared === undefined) continue;
      const valid = validateContentNamespace(String(declared));
      if (valid !== true) {
        throw new NamespaceResolutionError(`${this.url}: ${manifestRel}: ${valid}`);
      }
      const oid = await this.currentBlobOid(s, manifestRel);  // for versioned provenance
      return {
        ns: asContentNamespace(String(declared)),
        manifest: oid
          ? toLofsCanonical(withVersion(this.toRef(manifestRel), this.contentVersion(oid)))
          : undefined,
      };
    }

    // 2. Repo-name default — the repo's URL is the collection identity.
    try {
      return { ns: defaultNamespace(this.url) };
    } catch (err) {
      // Repo basename isn't a valid namespace (hyphens, leading digits, ...).
      throw new NamespaceResolutionError(
        `Cannot derive a namespace from repo URL "${this.url}": ${(err as Error).message} ` +
        `Add a manifest.yaml with an explicit "namespace:" field.`
      );
    }
  }

  async listFiles(_selection: FileSelection = {}): Promise<UriNode> {
    await this.ensureFresh();
    const s = this.requireState();
    // Flat path list → UriNode tree.
    const root: UriNode = { uri: '', children: [] };
    const dirs = new Map<string, UriNode>([['', root]]);
    const ensureDir = (dirPath: string): UriNode => {
      const existing = dirs.get(dirPath);
      if (existing) return existing;
      const parent = ensureDir(dirPath.includes('/') ? dirPath.slice(0, dirPath.lastIndexOf('/')) : '');
      const node: UriNode = { uri: dirPath, children: [] };
      parent.children!.push(node);
      dirs.set(dirPath, node);
      return node;
    };
    for (const relPath of [...s.tree.keys()].sort()) {
      const dirPath = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
      ensureDir(dirPath).children!.push({ uri: relPath });
    }
    return root;
  }

  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    await this.ensureFresh();
    const s = this.requireState();
    const base = basePrefix(basePath);
    const out: OlxRelativePath[] = [];
    for (const relPath of s.tree.keys()) {
      if (base && !relPath.startsWith(base)) continue;
      if (minimatch(base ? relPath.slice(base.length) : relPath, pattern, { dot: false })) {
        out.push(relPath as OlxRelativePath);
      }
    }
    return out.sort();
  }

  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    await this.ensureFresh();
    const s = this.requireState();
    const { basePath, include, limit = 1000 } = options;
    const base = basePrefix(basePath);
    const re = new RegExp(pattern);
    const matches: GrepMatch[] = [];
    for (const relPath of [...s.tree.keys()].sort()) {
      if (base && !relPath.startsWith(base)) continue;
      if (include && !minimatch(relPath, include)) continue;
      const lines = (await this.readBlob(s, relPath)).split('\n');
      for (let i = 0; i < lines.length && matches.length < limit; i++) {
        if (re.test(lines[i])) {
          matches.push({ path: relPath as OlxRelativePath, line: i + 1, content: lines[i] });
        }
      }
      if (matches.length >= limit) break;
    }
    return matches;
  }

  resolveRelativePath(baseProvenance: LofsRef, relativePath: string): SafeRelativePath {
    // Resolve against the base file's directory, within this repo.
    const basePath = this.ownPath(baseProvenance);
    const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : '';
    const parts = (baseDir + '/' + relativePath).split('/').filter(s => s && s !== '.');
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === '..') {
        if (resolved.length === 0) {
          throw new Error(`Path traversal above content root: "${relativePath}" from "${baseProvenance}"`);
        }
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }
    return resolved.join('/') as SafeRelativePath;
  }

  toLofsRef(safePath: SafeRelativePath): LofsRef {
    return this.toRef(this.guardPath(String(safePath)));
  }

  toRelativePath(uri: LofsRef): OlxRelativePath {
    return this.ownPath(uri) as OlxRelativePath;
  }

  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
    if (!isMediaFile(assetPath)) return false;
    await this.ensureFresh();
    const s = this.requireState();
    const relPath = this.guardPath(String(assetPath));
    if (!this.included(relPath)) return false;  // outside the served subtree
    // Media isn't in the content-file tree; check the blob directly.
    try {
      await this.readBlob(s, relPath);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // Writes — commit-on-write (see the header). Each is serialized and
  // ensures the repo is current before forking a commit from head.
  // ---------------------------------------------------------------------

  async write(p: OlxRelativePath, content: string, options: WriteOptions = {}): Promise<void> {
    return this.serialize(async () => {
      await this.ensureFresh();
      const s = this.requireState();
      const relPath = this.requireWritable(p);
      await this.checkConflict(s, relPath, options);
      const blobOid = await git.writeBlob({
        fs: { promises: s.vol.promises } as any,
        dir: REPO_DIR,
        blob: new TextEncoder().encode(content),
      });
      await this.commitChange(s, [{ path: relPath, blobOid }], options);
    });
  }

  /** Update an existing file. No conflict check (the interface carries no
   *  options); treat as an unconditional write. */
  async update(p: OlxRelativePath, content: string): Promise<void> {
    return this.write(p, content);
  }

  async delete(p: OlxRelativePath): Promise<void> {
    return this.serialize(async () => {
      await this.ensureFresh();
      const s = this.requireState();
      const relPath = this.requireWritable(p);
      if ((await this.currentBlobOid(s, relPath)) === null) {
        throw new Error(`File not found: ${p} (in ${this.url}#${this.ref})`);
      }
      await this.commitChange(s, [{ path: relPath, blobOid: null }], {});
    });
  }

  async rename(oldPath: OlxRelativePath, newPath: OlxRelativePath): Promise<void> {
    return this.serialize(async () => {
      await this.ensureFresh();
      const s = this.requireState();
      const from = this.requireWritable(oldPath);
      const to = this.requireWritable(newPath);
      const oid = await this.currentBlobOid(s, from);
      if (oid === null) throw new Error(`File not found: ${oldPath} (in ${this.url}#${this.ref})`);
      // One commit: add the blob at the new path, remove the old.
      await this.commitChange(
        s,
        [{ path: to, blobOid: oid }, { path: from, blobOid: null }],
        { message: `Rename ${from} → ${to}` },
      );
    });
  }

  /** Validate a write target and return its repo-relative path. */
  private requireWritable(p: OlxRelativePath): string {
    const relPath = this.guardPath(stripLeadingSlash(String(p)));
    if (!this.included(relPath)) {
      throw new Error(`Cannot write outside the served subtree of ${this.url}: ${p}`);
    }
    return relPath;
  }

  /** Optimistic conflict: the blob oid the editor last read (in
   *  previousMetadata) must still be current. Skipped without it or with
   *  force. The authoritative check is the non-fast-forward push rejection. */
  private async checkConflict(s: RepoState, relPath: string, options: WriteOptions): Promise<void> {
    if (!options.previousMetadata || options.force) return;
    const prev = options.previousMetadata as { oid?: string };
    if (prev.oid === undefined) return;  // nothing to compare (e.g. a non-content read)
    const current = await this.currentBlobOid(s, relPath);
    if (prev.oid !== current) {
      throw new VersionConflictError(
        'File has been modified since last read',
        { oid: current, head: s.head },
      );
    }
  }

  /** Blob oid at a repo-relative path under the snapshot's head, or null if absent. */
  private async currentBlobOid(s: RepoState, repoPath: string): Promise<string | null> {
    try {
      const { oid } = await git.readBlob({
        fs: { promises: s.vol.promises } as any,
        dir: REPO_DIR,
        oid: s.head,
        filepath: repoPath,
      });
      return oid;
    } catch {
      return null;
    }
  }

  /** Apply a set of path→blob changes (null blob = delete) as one commit on
   *  the captured snapshot `s`, push it, then publish a new snapshot locally.
   *  Built by tree plumbing — no working tree or index, so the clone stays
   *  noCheckout. All git reads/writes go through s.vol/s.head, so a concurrent
   *  refresh repoint can't mix this commit across volumes. */
  private async commitChange(
    s: RepoState,
    changes: Array<{ path: string; blobOid: string | null }>,
    options: WriteOptions,
  ): Promise<void> {
    const fs = { promises: s.vol.promises } as any;
    const { commit } = await git.readCommit({ fs, dir: REPO_DIR, oid: s.head });
    let treeOid = commit.tree;
    for (const c of changes) {
      treeOid = await this.updateTree(s, treeOid, c.path.split('/'), c.blobOid);
    }
    const newHead = await git.commit({
      fs,
      dir: REPO_DIR,
      message: options.message ?? defaultMessage(changes),
      tree: treeOid,
      parent: [s.head],
      author: options.author ?? PLATFORM_IDENTITY,   // teacher (or platform fallback)
      committer: PLATFORM_IDENTITY,                    // who physically committed
      ref: `refs/heads/${this.ref}`,
    });
    try {
      await this.pushRemote(s.vol);
    } catch (err: any) {
      // A non-fast-forward rejection means the branch moved under this edit.
      if (err?.code === 'PushRejectedError' || /fast-forward|rejected/i.test(err?.message ?? '')) {
        throw new VersionConflictError(
          `Push to ${this.url}#${this.ref} rejected — the branch moved since this edit; reload and retry. (${err.message})`,
        );
      }
      throw err;
    }
    // Commit + push both succeeded — publish a NEW snapshot (built on s, whose
    // vol now contains newHead) by an atomic repoint, so reads within the
    // cooldown window see the edit without waiting for a re-clone. A new tree
    // Map (not a mutation of s.tree) keeps any snapshot a concurrent reader
    // still holds intact. Skip if a refresh repointed away from s meanwhile —
    // that only happens when the remote moved, in which case the push above
    // would already have been rejected; the guard is belt-and-suspenders, and
    // the pushed commit is picked up by the next refresh regardless.
    if (this.state === s) {
      const tree = new Map(s.tree);
      for (const c of changes) {
        if (c.blobOid === null) tree.delete(c.path);
        else if (this.servesPath(c.path)) tree.set(c.path, { oid: c.blobOid });
      }
      this.state = { vol: s.vol, head: newHead, tree };
    }
  }

  /** Would walkTree index this path? (Mirrors its filter for local tree upkeep.) */
  private servesPath(repoPath: string): boolean {
    if (!this.included(repoPath)) return false;
    const base = repoPath.split('/').pop()!;
    return isContentFile(repoPath) || base === 'manifest.yaml';
  }

  /** Build a new tree oid from `treeOid` with `segments` set to `blobOid`
   *  (or removed when null). Recurses, rebuilding only the touched path;
   *  prunes directories left empty by a delete. */
  private async updateTree(s: RepoState, treeOid: string, segments: string[], blobOid: string | null): Promise<string> {
    const fs = { promises: s.vol.promises } as any;
    const { tree } = await git.readTree({ fs, dir: REPO_DIR, oid: treeOid });
    const [seg, ...rest] = segments;
    const others = tree.filter((e: any) => e.path !== seg);

    if (rest.length === 0) {
      const next = blobOid === null
        ? others
        : [...others, { mode: '100644', path: seg, oid: blobOid, type: 'blob' as const }];
      return git.writeTree({ fs, dir: REPO_DIR, tree: next });
    }

    const existing = tree.find((e: any) => e.path === seg && e.type === 'tree');
    if (!existing && blobOid === null) return treeOid;  // deleting under a nonexistent dir: no-op
    const subOid = existing
      ? existing.oid
      : await git.writeTree({ fs, dir: REPO_DIR, tree: [] });  // fresh empty subtree
    const newSub = await this.updateTree(s, subOid, rest, blobOid);
    const newSubEntries = (await git.readTree({ fs, dir: REPO_DIR, oid: newSub })).tree;
    const next = newSubEntries.length === 0
      ? others  // prune the directory a delete just emptied
      : [...others, { mode: '040000', path: seg, oid: newSub, type: 'tree' as const }];
    return git.writeTree({ fs, dir: REPO_DIR, tree: next });
  }

  /** Push the local branch to the remote — the network transport seam.
   *  Overridable: tests whose "remote" IS the in-memory repo no-op this (the
   *  commit already landed there). Rejection handling lives in commitChange,
   *  which maps a thrown PushRejectedError → VersionConflictError; here we
   *  only normalize the "ok: false" result into that same thrown shape so the
   *  two push-failure forms map uniformly. */
  protected async pushRemote(vol: Volume): Promise<void> {
    const result = await git.push({
      fs: { promises: vol.promises } as any,
      http,
      dir: REPO_DIR,
      url: this.url,
      remote: 'origin',
      ref: this.ref,
      onAuth: this.onAuth,
    }) as { ok?: boolean; error?: string | null; errors?: string[] };
    if (result && result.ok === false) {
      const e: any = new Error(`push rejected: ${JSON.stringify(result.error ?? result.errors ?? result)}`);
      e.code = 'PushRejectedError';
      throw e;
    }
  }
}

/** Default commit message when the caller supplies none. */
function defaultMessage(changes: Array<{ path: string; blobOid: string | null }>): string {
  if (changes.length === 1) {
    const [c] = changes;
    return `${c.blobOid === null ? 'Delete' : 'Update'} ${c.path}`;
  }
  return `Update ${changes.length} files`;
}
